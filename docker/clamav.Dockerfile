# The official image runs both clamd and freshclam. Do not add EXPOSE or publish
# a port: Render's private-service type is the network boundary.
FROM clamav/clamav:stable
COPY docker/clamd.conf /etc/clamav/clamd.conf
