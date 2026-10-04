#!/usr/bin/env python3
"""Publish only public/assets to the authorized bucket's llk/ prefix.

Credentials are read locally and are never copied into builds or logs.
"""
import base64
import concurrent.futures
import email.utils
import hashlib
import hmac
import json
import mimetypes
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
BUCKET = 'stoneage-assets'
ENDPOINT = f'https://{BUCKET}.oss-cn-shanghai.aliyuncs.com'
ORIGIN = 'https://llk.ichenj.com'
AK = (ROOT / '.work/secrets/oss-access-key-id').read_text().strip()
SK = (ROOT / '.work/secrets/oss-access-key-secret').read_text().strip()


def request(method, key='', body=None, content_type='', query='', headers=None):
    date = email.utils.formatdate(usegmt=True)
    md5 = base64.b64encode(hashlib.md5(body).digest()).decode() if body is not None else ''
    canonical = f'/{BUCKET}/{key}' + ('?' + query if query in ['cors', 'acl'] else '')
    signing = f'{method}\n{md5}\n{content_type}\n{date}\n{canonical}'
    signature = base64.b64encode(hmac.new(SK.encode(), signing.encode(), hashlib.sha1).digest()).decode()
    values = {'Date': date, 'Authorization': f'OSS {AK}:{signature}', **(headers or {})}
    if body is not None:
        values['Content-MD5'] = md5
    if content_type:
        values['Content-Type'] = content_type
    url = ENDPOINT + '/' + urllib.parse.quote(key, safe='/') + ('?' + query if query else '')
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=values, method=method), timeout=45) as response:
        return response.status, response.read(), dict(response.headers)


def configure_cors():
    try:
        _, current, _ = request('GET', query='cors')
        root = ET.fromstring(current)
    except urllib.error.HTTPError as error:
        data = error.read()
        if error.code != 404 or b'NoSuchCORSConfiguration' not in data:
            raise RuntimeError(f'Could not read CORS: HTTP {error.code}') from None
        current = b''
        root = ET.Element('CORSConfiguration')
    backup = ROOT / '.work/deploy/oss-cors-before.xml'
    if not backup.exists():
        backup.write_bytes(current or b'<!-- No previous CORS configuration -->')
    for rule in root.findall('CORSRule'):
        origins = [x.text for x in rule.findall('AllowedOrigin')]
        methods = {x.text for x in rule.findall('AllowedMethod')}
        if (ORIGIN in origins or '*' in origins) and {'GET', 'HEAD'} <= methods:
            print('CORS already permits game assets.')
            return
    rule = ET.SubElement(root, 'CORSRule')
    for tag, value in [('AllowedOrigin', ORIGIN), ('AllowedMethod', 'GET'), ('AllowedMethod', 'HEAD'), ('AllowedHeader', 'Range'), ('ExposeHeader', 'ETag'), ('ExposeHeader', 'Content-Length'), ('ExposeHeader', 'Content-Range'), ('MaxAgeSeconds', '3600')]:
        ET.SubElement(rule, tag).text = value
    request('PUT', body=ET.tostring(root, encoding='utf-8', xml_declaration=True), content_type='application/xml', query='cors')
    print('CORS enabled for', ORIGIN)


def upload(path):
    key = 'llk/' + path.relative_to(ROOT / 'public/assets').as_posix()
    data = path.read_bytes()
    content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    _, _, response_headers = request('PUT', key, data, content_type, headers={'Cache-Control': 'public, max-age=86400'})
    etag = response_headers.get('ETag', response_headers.get('Etag', '')).strip('"')
    if etag.lower() != hashlib.md5(data).hexdigest():
        raise RuntimeError(f'Upload checksum mismatch: {key}')
    return {'key': key, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'cdn': 'https://cdn.ichenj.com/' + key}


if __name__ == '__main__':
    (ROOT / '.work/deploy').mkdir(parents=True, exist_ok=True)
    configure_cors()
    request('PUT', 'llk/', b'', 'application/x-directory')
    paths = sorted(p for p in (ROOT / 'public/assets').rglob('*') if p.is_file())
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        results = list(executor.map(upload, paths))
    (ROOT / '.work/deploy/oss-upload.json').write_text(json.dumps(results, indent=2) + '\n')
    print(f'Uploaded and checked {len(results)} assets, {sum(x["bytes"] for x in results):,} bytes, under llk/.')
