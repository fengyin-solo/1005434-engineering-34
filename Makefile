.PHONY: install frontend build release rollback

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

release:
	node scripts/release.mjs

rollback:
	node scripts/rollback.mjs
