#!/bin/bash

# Get full container ID of the whatsapp-auto-warmer container
CONTAINER_NAME="whatsapp-auto-warmer"
CONTAINER_ID=$(docker inspect --format='{{.Id}}' "$CONTAINER_NAME")

# Truncate Docker log file for the container
LOG_PATH="/var/lib/docker/containers/$CONTAINER_ID/$CONTAINER_ID-json.log"
# if [ -f "$LOG_PATH" ]; then
  sudo truncate -s 0 "$LOG_PATH"
# else
#   echo "Log file not found: $LOG_PATH"
# fi

# Reset message-history.json file
HISTORY_FILE="/home/miftahul/whatsapp-auto-warmer/data/message-history.json"
echo "[]" > "$HISTORY_FILE"
