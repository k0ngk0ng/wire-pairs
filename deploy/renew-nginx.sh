#!/bin/sh
set -eu
case " ${RENEWED_DOMAINS:-} " in
  *" llk.ichenj.com "*) /usr/sbin/nginx -t && /bin/systemctl reload nginx ;;
esac
