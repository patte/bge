#!/bin/sh
mongod  --port 10000 --ipv6 --bind_ip $(grep fly-local-6pn /etc/hosts | awk '{print $1}')
