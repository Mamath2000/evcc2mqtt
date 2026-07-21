.PHONY: install start test clean

install:
	npm install

start:
	npm start

test:
	npm test

clean:
	rm -rf node_modules
