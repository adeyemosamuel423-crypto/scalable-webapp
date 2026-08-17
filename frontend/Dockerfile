# ============================================================
# StreamHive Frontend
# ============================================================

FROM nginx:1.27-alpine

# Install gettext for envsubst
RUN apk add --no-cache gettext

# Copy Nginx template
COPY nginx.conf.template /etc/nginx/default.conf.template

# Copy frontend files
COPY public/ /usr/share/nginx/html/

# Create startup script
RUN printf '#!/bin/sh\n\
set -e\n\
echo "=============================================="\n\
echo "Starting StreamHive Frontend"\n\
echo "=============================================="\n\
echo "BACKEND_URL=$BACKEND_URL"\n\
echo ""\n\
if [ -z "$BACKEND_URL" ]; then\n\
  echo "ERROR: BACKEND_URL is not set"\n\
  exit 1\n\
fi\n\
sed "s|BACKEND_URL_PLACEHOLDER|$BACKEND_URL|g" /etc/nginx/default.conf.template > /etc/nginx/conf.d/default.conf\n\
echo "Generated Nginx configuration:"\n\
cat /etc/nginx/conf.d/default.conf\n\
echo ""\n\
echo "Testing Nginx configuration..."\n\
nginx -t\n\
echo ""\n\
echo "Starting Nginx..."\n\
exec nginx -g "daemon off;"\n' > /docker-entrypoint-streamhive.sh \
    && chmod +x /docker-entrypoint-streamhive.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint-streamhive.sh"]