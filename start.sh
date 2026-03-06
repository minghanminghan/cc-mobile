#!/bin/sh

# Finally, start the main Node processes (the VITE static server and the mobile-terminal relay)
echo "Starting mobile-terminal relay and web server..."
exec npm run start:node
