#!/bin/bash
npm run dev > server.log 2>&1 &
SERVER_PID=$!
sleep 5 # wait for server to start
curl -sS -f -v -X POST -H "Authorization: Bearer local-dev-cron-secret-1783228506" "http://localhost:3000/api/platform/scheduler/run-due"
kill $SERVER_PID
