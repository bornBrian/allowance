#!/bin/sh
# Downloads Litestream (https://litestream.io) into bin/ during the Render build,
# and refuses it unless the checksum matches the one published for this release.
set -eu
VERSION=0.5.17
SHA256=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
FILE="litestream-$VERSION-linux-x86_64.tar.gz"
mkdir -p bin
curl -fsSL -o "bin/$FILE" "https://github.com/benbjohnson/litestream/releases/download/v$VERSION/$FILE"
echo "$SHA256  bin/$FILE" | sha256sum -c -
tar -xzf "bin/$FILE" -C bin litestream
rm "bin/$FILE"
bin/litestream version
