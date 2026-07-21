.DEFAULT_GOAL := help

.PHONY: help install start test clean docker-build docker-run \
	release release-patch release-minor release-major \
	release-docker release-docker-push

help: ## Affiche l'aide
	@printf "\nTargets disponibles:\n\n"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' Makefile | awk 'BEGIN {FS=":.*?## "} {printf "  %-22s %s\n", $$1, $$2}'
	@printf "\nExemples:\n"
	@printf "  make start\n"
	@printf "  make release-docker-push\n\n"

install: ## Installe les dépendances (npm install)
	npm install

start: ## Lance le programme
	npm start

test: ## Lance les tests de composant (node --test)
	npm test

clean: ## Supprime node_modules
	rm -rf node_modules

docker-build: ## Construit l'image Docker localement (sans bump de version)
	docker build -t evcc2mqtt:latest .

docker-run: ## Lance le container (utilise ./.env)
	docker run --rm --env-file .env evcc2mqtt:latest

release: release-minor ## Alias de release-minor

release-patch: ## Incrémente la version (patch) + tag git
	./scripts/release.sh patch

release-minor: ## Incrémente la version (minor) + tag git
	./scripts/release.sh minor

release-major: ## Incrémente la version (major) + tag git
	./scripts/release.sh major

release-docker: ## Incrémente la version (minor) + build l'image Docker
	./scripts/release.sh minor --docker

release-docker-push: ## Incrémente la version (minor) + build + push l'image Docker
	./scripts/release.sh minor --docker --push
