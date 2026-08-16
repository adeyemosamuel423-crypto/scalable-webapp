# ============================================================
# StreamHive Frontend
# Azure Container Apps compatible
# ============================================================

FROM nginx:1.27-alpine


# ============================================================
# NGINX CONFIGURATION TEMPLATE
# ============================================================
# The official Nginx image processes templates placed in:
#
# /etc/nginx/templates/
#
# Environment variables such as BACKEND_URL are substituted
# automatically when the container starts.
#
# Local:
#     BACKEND_URL=http://backend:4000
#
# Azure:
#     BACKEND_URL=http://streamhive-api
# ============================================================

COPY nginx.conf.template \
     /etc/nginx/templates/default.conf.template


# ============================================================
# FRONTEND STATIC FILES
# ============================================================

COPY public/ /usr/share/nginx/html/


# ============================================================
# NGINX PORT
# ============================================================

EXPOSE 80