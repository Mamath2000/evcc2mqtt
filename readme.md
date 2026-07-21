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
| `MQTT_CLIENT_ID` | Client ID MQTT | `evcc2mqtt` |
| `TOPIC_PREFIX` | Préfixe des topics d'état | `evcc2mqtt` |
| `HA_DISCOVERY_PREFIX` | Préfixe des topics de discovery HA | `homeassistant` |
| `CONSO_TOPIC` | Topic MQTT d'où lire la consommation véhicule fixe, en Wh/km | `evcc2mqtt/config/conso_wh_km` |
| `POLL_INTERVAL_MS` | Fréquence de rafraîchissement/republication | `60000` (1 min) |
| `LOG_LEVEL` | Verbosité des logs : `error`, `info`, `debug` | `info` |

## Fonctionnement

- Au démarrage puis toutes les `POLL_INTERVAL_MS` : récupère les sessions evcc du mois en
  cours, isole celles d'aujourd'hui (heure locale du serveur), et agrège les métriques.
- Publie un seul message de découverte HA "device discovery" à la connexion (retained) sur
  `homeassistant/device/evcc2mqtt/config`, déclarant un device "EVCC" avec ses 10 composants
  (un par métrique), tous alimentés par un unique topic d'état JSON `evcc2mqtt/sessions`
  (mis à jour à chaque cycle) via des `value_template`.
- Métriques publiées : `chargedEnergy`, `solarCharged`, `gridCharged`,
  `sessionSolarPercentage`, `price`, `pricePerKWh`, `co2`, `co2PerKWh`, `savePrice`,
  `pricePer100Km`.
- `pricePer100Km` nécessite une consommation véhicule (Wh/km) : publier une valeur numérique
  retained sur `CONSO_TOPIC`. Tant qu'aucune valeur n'a été reçue, cette métrique vaut `0`.
- Si aucune session n'existe encore aujourd'hui, le cycle est simplement ignoré (les dernières
  valeurs retained restent affichées dans HA).
- Publie aussi, à chaque cycle, le détail brut des sessions du jour (tableau JSON) sur un topic
  de debug `evcc2mqtt/debug/sessions`, pour inspecter facilement les sessions utilisées dans le
  calcul (utile avec MQTT Explorer par exemple).

## Limitations connues

- Seule la journée en cours est suivie (pas de capteur "hier" séparé) : l'historique est géré
  par HA (recorder/statistics) à partir des mises à jour reçues, pas par le programme.
- La consommation véhicule est une valeur unique (pas de table mensuelle comme dans l'ancien
  flow) : à revoir plus tard si besoin d'un historique de conso par mois.
