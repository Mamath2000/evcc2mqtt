# evcc2mqtt

Passerelle Node.js entre l'API [evcc](https://evcc.io) et Home Assistant via MQTT.

Récupère les sessions de charge evcc du jour, calcule des indicateurs journaliers (énergie
chargée, part solaire/réseau, prix, CO2, économie solaire, prix au 100 km) et les republie en
continu comme capteurs MQTT via Home Assistant MQTT Discovery (création automatique des
entités, sans écriture directe en base).

Réécriture Node.js d'un flow Node-RED existant (qui écrivait directement dans une table LTSS
Postgres/cagg) ; ce projet remplace cette étape par une simple publication MQTT vers HA.

## Installation

```bash
make install
cp .env.example .env
# éditer .env : EVCC_HOST, MQTT_URL, etc.
make start
```

## Commandes

| Commande | Effet |
| --- | --- |
| `make install` | `npm install` |
| `make start` | Lance le programme (`npm start`) |
| `make test` | Lance les tests de composant (`node --test`) |
| `make clean` | Supprime `node_modules` |
| `make docker-build` | Build l'image Docker locale (sans bump de version) |
| `make docker-run` | Lance le container (`--env-file .env`) |
| `make release` | Alias de `release-minor` |
| `make release-patch` | Incrémente la version (patch) + tag git |
| `make release-minor` | Incrémente la version (minor) + tag git |
| `make release-major` | Incrémente la version (major) + tag git |
| `make release-docker` | Incrémente la version (minor) + build l'image Docker |
| `make release-docker-push` | Incrémente la version (minor) + build + push l'image Docker |

## Tests

Tests de composant sous `test/` (test runner intégré de Node, aucune dépendance
supplémentaire) : logique d'agrégation (`aggregate.js`, avec les valeurs de référence issues du
flow Node-RED d'origine), construction du payload de découverte HA (`discovery.js`), appels à
l'API evcc avec `fetch` mocké (`evccApi.js`), et suivi de la consommation véhicule via un faux
client MQTT (`consumption.js`).

## Configuration (`.env`)

| Variable | Description | Défaut |
| --- | --- | --- |
| `EVCC_HOST` | Adresse IP/hostname du serveur evcc | *(obligatoire)* |
| `EVCC_PORT` | Port de l'API evcc | `7070` |
| `EVCC_LANG` | Langue passée à l'API sessions | `fr` |
| `MQTT_URL` | URL du broker MQTT (`mqtt://host:1883`) | *(obligatoire)* |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | Identifiants MQTT | *(vide)* |
| `TOPIC_PREFIX` | Préfixe des topics d'état | `evcc2mqtt` |
| `HA_DISCOVERY_PREFIX` | Préfixe des topics de discovery HA | `homeassistant` |
| `HA_DEVICE_NAME` | Nom du device affiché dans Home Assistant | `EVCC (MQTT)` |
| `CONSO_TOPIC` | Topic MQTT d'où lire la consommation véhicule fixe, en Wh/km | `evcc2mqtt/config/conso_wh_km` |
| `POLL_INTERVAL_MS` | Fréquence de rafraîchissement/republication | `60000` (1 min) |
| `LOG_LEVEL` | Verbosité des logs : `error`, `info`, `debug` | `info` |
| `APP_TIMEZONE` | Fuseau IANA utilisé pour déterminer "aujourd'hui" et le mois en cours | `Europe/Paris` |

## Fonctionnement

- Au démarrage puis toutes les `POLL_INTERVAL_MS` : récupère les sessions evcc du mois en
  cours, isole celles d'aujourd'hui, et agrège les métriques. "Aujourd'hui" et "le mois en
  cours" sont déterminés via le fuseau `APP_TIMEZONE`, **pas** l'horloge système du
  process/conteneur (qui tourne en UTC par défaut sous Docker) — voir
  [Fuseau horaire](#fuseau-horaire).
- Publie un seul message de découverte HA "device discovery" à la connexion (retained) sur
  `homeassistant/device/evcc2mqtt/config`, déclarant un device (nom configurable via
  `HA_DEVICE_NAME`) avec ses 11 composants (10 métriques + la consommation véhicule).
  Les 10 métriques sont alimentées par un unique topic d'état JSON `evcc2mqtt/sessions`
  (mis à jour à chaque cycle) via des `value_template` ; le capteur de consommation a son
  propre topic (voir ci-dessous).
- Métriques publiées (labels HA en français) : `chargedEnergy` (Énergie chargée),
  `solarCharged` (Charge Solaire), `gridCharged` (Import Réseau), `sessionSolarPercentage`
  (Pourcentage de Solaire), `price` (Cout du jour), `pricePerKWh` (Prix par kWh), `co2` (CO2 du
  jour), `co2PerKWh` (CO2 par kWh), `savePrice` (Economie), `pricePer100Km` (Prix pour 100Km).
- `pricePer100Km` nécessite une consommation véhicule (Wh/km) : publier une valeur numérique
  retained sur `CONSO_TOPIC`. Tant qu'aucune valeur n'a été reçue, cette métrique vaut `0`.
- Cette même valeur de consommation est aussi republiée telle quelle (pas de recalcul
  hebdo/mensuel/annuel) sur `evcc2mqtt/consumption`, exposée comme capteur HA "Consommation
  véhicule" (Wh/km), dès sa réception sur `CONSO_TOPIC` — indépendamment du cycle de polling.
- Si aucune session n'existe encore aujourd'hui, l'état publié est remis à zéro (et non pas
  laissé tel quel) : sinon le topic retained garderait la dernière valeur figée de la veille,
  que HA enregistrerait comme si elle appartenait au nouveau jour.
- Publie aussi, à chaque cycle, le détail brut des sessions du jour (tableau JSON) sur un topic
  de debug `evcc2mqtt/debug/sessions`, pour inspecter facilement les sessions utilisées dans le
  calcul (utile avec MQTT Explorer par exemple).

## Fuseau horaire

`sessionsForDay`/`fetchCurrentMonthSessions` déterminent "aujourd'hui" et "le mois en cours" à
partir de `APP_TIMEZONE` (`Europe/Paris` par défaut), via `Intl.DateTimeFormat`, et non via
l'horloge système du process. C'est volontaire : un conteneur Docker tourne en UTC par défaut,
et s'appuyer sur l'heure système ferait basculer "aujourd'hui" à minuit UTC (2h du matin heure
de Paris en été) au lieu de minuit heure locale. Sans ce correctif, la valeur figée de la
veille (dernier état retenu par MQTT) se retrouve enregistrée par HA comme si elle appartenait
au nouveau jour, pendant les ~2h qui suivent minuit UTC.

## Docker et release

L'image Docker est construite via un `Dockerfile` multi-stage (`node:20-alpine`, dépendances
de production uniquement).

Le versionnage suit `package.json` (semver). `make release-minor` (ou son alias `make
release`) incrémente la version **mineure**, commit `package.json`/`package-lock.json` et pose
un tag git `vX.Y.Z` si on est dans un dépôt git. `make release-docker` fait la même chose puis
construit l'image ; `make release-docker-push` construit et pousse en plus les tags
`latest`/`X.Y.Z`/`<git-ref-court>` sur Docker Hub (nécessite `docker login` au préalable).

Le repo/nom d'image Docker Hub sont surchargeables via les variables d'environnement
`DOCKER_USER` (défaut `mathmath350`) et `APP_NAME` (défaut `evcc2mqtt`), par exemple :

```bash
DOCKER_USER=mon_compte make release-docker-push
```

Pour un simple build/run local sans toucher à la version : `make docker-build` puis `make
docker-run` (celui-ci monte `./.env` dans le container via `--env-file`).

### docker-compose

Deux exemples sont fournis :

- `docker-compose.yml` : utilise l'image publiée (`mathmath350/evcc2mqtt:latest`).
- `docker-compose.example.yml` : build depuis les sources locales (`build: context: .`).

Les deux lisent la config depuis `./.env` (`env_file`) et fixent `TZ=Europe/Paris` pour que les
horodatages de logs soient lisibles en heure locale. Ce n'est plus le seul garde-fou pour le
calcul du jour courant (voir [Fuseau horaire](#fuseau-horaire) : `APP_TIMEZONE`, indépendant de
`TZ`, s'en charge), mais autant garder les deux cohérents. Adapte `TZ` et `APP_TIMEZONE` à ton
fuseau si besoin.

```bash
cp .env.example .env   # puis éditer .env

# avec l'image publiée
docker compose up -d

# ou en buildant en local
docker compose -f docker-compose.example.yml up -d --build
```

## Limitations connues

- Seule la journée en cours est suivie (pas de capteur "hier" séparé) : l'historique est géré
  par HA (recorder/statistics) à partir des mises à jour reçues, pas par le programme.
- La consommation véhicule est une valeur unique (pas de table mensuelle comme dans l'ancien
  flow) : à revoir plus tard si besoin d'un historique de conso par mois.
