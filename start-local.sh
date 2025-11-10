#!/bin/bash
# 로컬 SQLite를 사용해서 개발 서버 시작
unset TURSO_DATABASE_URL
unset TURSO_AUTH_TOKEN
npm run dev
