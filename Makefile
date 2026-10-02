.PHONY: install frontend build release verify-clean

install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

verify-clean:
	cd frontend && npm run verify:clean

# 发版入口：先跑依赖校验与类型检查，任一失败即中断，不进入打包。
release: build
