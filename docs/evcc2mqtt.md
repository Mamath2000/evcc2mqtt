---
id: evcc2mqtt
title: evcc2mqtt
sidebar_label: evcc2mqtt
sidebar_position: 1
description: Passerelle Node.js entre l'API evcc et Home Assistant via MQTT.
---

## Origine du besoin

Le pilotage de la recharge du véhicule électrique est géré par [evcc](https://evcc.io), qui
conserve l'historique des sessions de charge (énergie chargée, part solaire, prix, CO2, ...).
Cet historique n'est pas directement exploitable dans Home Assistant : il faut aller le
chercher dans l'API evcc et le transformer en indicateurs journaliers.

Ce besoin était initialement couvert par un flow **Node-RED** qui :

- interrogeait l'API evcc pour le mois courant et le mois précédent,
- recalculait, à chaque exécution (toutes les heures), les indicateurs des **4 derniers jours**,
- écrivait directement ces indicateurs dans une table **LTSS** (PostgreSQL / TimescaleDB, via
  des *continuous aggregates*) utilisée par Home Assistant comme historique long terme.

Cette approche fonctionnait mais couplait fortement le programme à une base de données
spécifique (LTSS/cagg), avec une logique de "backfill" des jours passés qui compliquait le
flow sans réel bénéfice au quotidien.

**evcc2mqtt** est la réécriture Node.js de ce flow, avec un objectif de simplification :

- on ne recalcule et republie **que la journée en cours**, en continu (toutes les minutes),
- on ne fait plus d'écriture directe en base : le programme **publie uniquement en MQTT**, avec
  la découverte automatique Home Assistant (MQTT Discovery), et laisse HA (recorder /
  statistics) gérer l'historique et la persistance.

## Ce que fait le programme

Au démarrage, puis toutes les `POLL_INTERVAL_MS` (1 minute par défaut) :

1. il appelle l'API evcc pour récupérer les sessions de charge du **mois en cours** ;
2. il filtre ces sessions pour ne garder que celles d'**aujourd'hui** (date locale du serveur) ;
3. il publie la liste brute des sessions du jour sur un topic MQTT de debug ;
4. si au moins une session existe pour aujourd'hui, il agrège ces sessions en un seul jeu
   d'indicateurs journaliers (énergie chargée, part solaire/réseau, prix, CO2, économie
   solaire, prix au 100 km) ;
5. il publie ces indicateurs en MQTT, sous une forme exploitable directement par Home Assistant
   via MQTT Discovery (voir plus bas).

S'il n'y a encore aucune session aujourd'hui (par exemple juste après minuit), le cycle est
simplement ignoré : les dernières valeurs *retained* restent affichées telles quelles dans HA.

Le programme tourne en continu (`node src/index.js`, cf. [Make et tests](#make-et-tests)) ; il
n'y a pas de cron externe, la temporisation est gérée en interne via `setInterval`.

## L'API evcc appelée

evcc expose une API HTTP locale. Le programme appelle :

```
GET http://{EVCC_HOST}:{EVCC_PORT}/api/sessions?lang={EVCC_LANG}&month={M}&year={Y}
```

où `M`/`Y` sont le mois et l'année **en cours** (`1-12` / `AAAA`). La réponse est un tableau
JSON de sessions de charge terminées ou en cours ce mois-là.

Champs de chaque session effectivement utilisés par evcc2mqtt :

| Champ | Type | Description |
| --- | --- | --- |
| `id` | number | Identifiant de la session, repris tel quel dans le topic de debug. |
| `created` | string (ISO 8601) | Date/heure de début de la session. Seule la partie date (`YYYY-MM-DD`) sert à déterminer si la session appartient à "aujourd'hui". |
| `chargedEnergy` | number (kWh) | Énergie totale chargée pendant la session. |
| `solarPercentage` | number (0-100) | Part de l'énergie chargée provenant du solaire. Sert à calculer `solarCharged`/`gridCharged` par session (`chargedEnergy * solarPercentage / 100`). |
| `price` | number (devise) | Coût total de la session. |
| `co2PerKWh` | number (g/kWh) | Intensité carbone moyenne de l'énergie chargée pendant la session ; multipliée par `chargedEnergy` pour obtenir le CO2 total de la session. |

La réponse evcc contient d'autres champs (véhicule, point de charge, durée, puissance
moyenne, `pricePerKWh` de la session, etc.) qui ne sont pas utilisés par evcc2mqtt aujourd'hui.

## Ce que produisons : MQTT et Home Assistant

Tous les topics sont préfixés par `TOPIC_PREFIX` (`evcc2mqtt` par défaut).

### Topics publiés

| Topic | Contenu | Retained |
| --- | --- | --- |
| `{prefix}/status` | `online` / `offline` (LWT MQTT du client) | oui |
| `{prefix}/sessions` | Indicateurs agrégés du jour, en JSON (voir ci-dessous) | oui |
| `{prefix}/consumption` | Écho brut de la valeur reçue sur `CONSO_TOPIC` (Wh/km) | oui |
| `{prefix}/debug/sessions` | Détail brut des sessions du jour (tableau JSON), avant agrégation | oui |
| `{haDiscoveryPrefix}/device/{prefix}/config` | Message de découverte HA (voir ci-dessous) | oui |

Exemple de payload sur `{prefix}/sessions` :

```json
{
  "chargedEnergy": 15,
  "solarCharged": 5,
  "gridCharged": 10,
  "sessionSolarPercentage": 33.3,
  "price": 3.5,
  "co2": 800,
  "pricePerKWh": 0.233,
  "co2PerKWh": 53.33,
  "savePrice": 1.75,
  "pricePer100Km": 3.85
}
```

`pricePer100Km` dépend d'une consommation véhicule (Wh/km) lue sur le topic `CONSO_TOPIC` (voir
[Paramètres du fichier .env](#paramètres-du-fichier-env)) ; tant qu'aucune valeur n'a été reçue,
cette métrique vaut `0`.

Cette même valeur de consommation est aussi republiée telle quelle (sans recalcul
hebdomadaire/mensuel/annuel — evcc2mqtt n'a pas accès à la distance parcourue) sur
`{prefix}/consumption` dès sa réception sur `CONSO_TOPIC`, indépendamment du cycle de
polling, et exposée comme capteur HA "Consommation véhicule".

### Intégration Home Assistant (MQTT Discovery)

evcc2mqtt utilise le format **"device discovery"** de Home Assistant : un seul message de
découverte (retained, publié à la connexion) déclare un device (nom configurable via
`HA_DEVICE_NAME`, `EVCC (MQTT)` par défaut) avec l'ensemble de ses
capteurs (`components`), tous alimentés par l'unique topic d'état `{prefix}/sessions` via des
`value_template` (ex. `{{ value_json.chargedEnergy | default(0) }}`).

HA crée ainsi automatiquement 11 entités `sensor.*` (les 10 métriques, en français : Énergie
chargée, Charge Solaire, Import Réseau, Pourcentage de Solaire, Cout du jour, Prix par kWh, CO2
du jour, CO2 par kWh, Economie, Prix pour 100Km — plus le capteur Consommation véhicule, qui
lui lit son propre topic `{prefix}/consumption` au lieu de `{prefix}/sessions`). Leur
disponibilité suit le topic `{prefix}/status`.

Le topic `{prefix}/debug/sessions` n'est volontairement pas déclaré en découverte HA (pas
d'entité associée) : il est destiné à l'inspection manuelle (MQTT Explorer, `mosquitto_sub`,
etc.) plutôt qu'à l'affichage dans HA.

### Robustesse de la connexion MQTT (LWT)

`{prefix}/status` est le topic d'**availability** utilisé par tous les composants HA du
device ; sa valeur (`online`/`offline`) est pilotée par le mécanisme **LWT** (*Last Will and
Testament*) de MQTT :

- à la connexion, le client déclare un message `will` (`offline`, retained, QoS 1) que le
  **broker** publiera lui-même à sa place s'il détecte une déconnexion anormale (crash, coupure
  réseau, absence de PING dans le délai `keepalive`) ;
- à chaque connexion (initiale ou après reconnexion), le client republie explicitement
  `online` (message de "naissance").

Le client MQTT (`mqtt.js`) gère nativement les reconnexions (`reconnectPeriod`) et
re-souscrit automatiquement aux topics après une coupure. Le point important côté code
applicatif : la souscription au topic de consommation et le démarrage de la boucle de
polling (`setInterval`) ne doivent être armés **qu'une seule fois**, à la toute première
connexion (`client.once('connect', ...)`) — sinon, chaque reconnexion réarme une boucle de
polling supplémentaire en parallèle des précédentes, ce qui multiplie le trafic MQTT et peut
lui-même provoquer de nouvelles coupures (effet boule de neige). La configuration de
découverte HA étant *retained*, elle n'a pas besoin d'être republiée à chaque reconnexion.

Le client ne fixe pas de `clientId` : `mqtt.js` en génère un aléatoire à chaque connexion.
Cela évite qu'un ancien process encore actif (redémarrage mal terminé, double lancement) et le
nouveau se disputent le même identifiant — le broker MQTT n'autorise qu'une connexion par
`clientId` et coupe systématiquement l'une des deux à chaque fois que l'autre se (re)connecte.

## Make et tests

Le projet expose un `Makefile` pour les commandes courantes :

| Commande | Effet |
| --- | --- |
| `make install` | `npm install` |
| `make start` | Lance le programme (`npm start`) |
| `make test` | Lance les tests de composant (`npm test`, soit `node --test test/`) |
| `make clean` | Supprime `node_modules` |
| `make docker-build` | Build l'image Docker locale (sans bump de version) |
| `make docker-run` | Lance le container (`--env-file .env`) |
| `make release` | Alias de `release-minor` |
| `make release-patch` / `release-minor` / `release-major` | Incrémente la version + tag git |
| `make release-docker` | Incrémente la version (minor) + build l'image Docker |
| `make release-docker-push` | Incrémente la version (minor) + build + push l'image Docker |

Les tests sont des **tests de composant**, situés dans `test/`, écrits avec le test runner
intégré à Node.js (`node:test`) — aucune dépendance de test supplémentaire n'est nécessaire.
Chaque module métier a son fichier de test dédié :

- `aggregate.test.js` : logique de regroupement/agrégation journalière (`sessionsForDay`,
  `computeDayAggregate`), avec des valeurs de référence reprenant les formules du flow
  Node-RED d'origine, ainsi que les cas limites (pas de session, journée 100 % solaire).
- `discovery.test.js` : structure du message de découverte HA (device, availability,
  components) et des payloads publiés (`publishState`, `publishDebugSessions`), via un faux
  client MQTT qui capture les appels `publish`.
- `evccApi.test.js` : appels à l'API evcc avec `fetch` mocké (URL générée, gestion des réponses
  en erreur).
- `consumption.test.js` : suivi de la consommation véhicule reçue par MQTT, via un faux client
  MQTT (`EventEmitter`) simulant `subscribe`/`message`.
- `logger.test.js` : filtrage des logs selon `LOG_LEVEL`.

Ces tests ne nécessitent ni broker MQTT ni instance evcc réelle : toutes les dépendances
externes (`fetch`, client MQTT) sont mockées.

## Docker et release

Le versionnage suit `package.json` (semver). Le mécanisme de release
(`scripts/release.sh`, `scripts/bump-version.js`) incrémente la version — **mineure par
défaut** — dans `package.json`/`package-lock.json`, commit ce changement et pose un tag git
`vX.Y.Z` si le répertoire est un dépôt git, avant de déclencher (optionnellement) le build et
le push de l'image Docker via `scripts/build-docker-image.sh`.

L'image est construite depuis un `Dockerfile` multi-stage (`node:20-alpine`, dépendances de
production uniquement via `npm ci --omit=dev`). Le repo/nom d'image Docker Hub sont
surchargeables via les variables d'environnement `DOCKER_USER` (défaut `mathmath350`) et
`APP_NAME` (défaut `evcc2mqtt`) :

```bash
# bump minor + commit + tag git, sans docker
make release

# bump minor + build local (tags :latest, :X.Y.Z, :<git-ref-court>)
make release-docker

# bump minor + build + push sur Docker Hub (nécessite `docker login`)
make release-docker-push

# build/run local sans toucher à la version
make docker-build
make docker-run
```

Ce mécanisme s'inspire de celui du projet [envoyJS](https://github.com/Mamath2000/envoyJS),
dont il reprend la structure (`Makefile` + `scripts/release.sh` + `scripts/bump-version.js` +
`scripts/build-docker-image.sh`), en changeant l'incrément par défaut de *patch* à *minor*.

### docker-compose

Deux fichiers d'exemple sont fournis, tous deux pilotés par `env_file: ./.env` :

- `docker-compose.yml` : tire l'image publiée `mathmath350/evcc2mqtt:latest`.
- `docker-compose.example.yml` : build depuis le `Dockerfile` local (`build: context: .`).

Les deux fixent `TZ=Europe/Paris` sur le conteneur. C'est important : `sessionsForDay`
détermine "aujourd'hui" via `localDateKey(new Date())`, donc à partir de l'heure **locale** du
processus. Un conteneur Docker tourne par défaut en UTC ; sans ce `TZ`, le changement de jour
se ferait à minuit UTC (soit 1h ou 2h du matin heure française) au lieu de minuit heure locale.

## Paramètres du fichier .env

| Variable | Description | Défaut |
| --- | --- | --- |
| `EVCC_HOST` | Adresse IP/hostname du serveur evcc | *(obligatoire)* |
| `EVCC_PORT` | Port de l'API evcc | `7070` |
| `EVCC_LANG` | Langue passée à l'API sessions (`lang=`) | `fr` |
| `MQTT_URL` | URL du broker MQTT (`mqtt://host:1883`) | *(obligatoire)* |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | Identifiants MQTT | *(vide)* |
| `TOPIC_PREFIX` | Préfixe de tous les topics publiés par le programme | `evcc2mqtt` |
| `HA_DISCOVERY_PREFIX` | Préfixe des topics de découverte HA | `homeassistant` |
| `HA_DEVICE_NAME` | Nom du device affiché dans Home Assistant | `EVCC (MQTT)` |
| `CONSO_TOPIC` | Topic MQTT d'où lire la consommation véhicule fixe, en Wh/km (payload numérique) | `evcc2mqtt/config/conso_wh_km` |
| `POLL_INTERVAL_MS` | Fréquence de rafraîchissement/republication des indicateurs | `60000` (1 min) |
| `LOG_LEVEL` | Verbosité des logs : `error`, `info`, `debug` | `info` |

## Limitations connues

- Seule la journée en cours est suivie : il n'y a pas de capteur "hier" séparé, l'historique
  est géré par HA (recorder/statistics) à partir des mises à jour reçues, pas par le programme.
- La consommation véhicule (`CONSO_TOPIC`) est une valeur unique et fixe, pas une table
  mensuelle comme dans l'ancien flow Node-RED : à revoir plus tard si besoin d'un historique de
  consommation par mois.
