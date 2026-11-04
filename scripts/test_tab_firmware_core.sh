#!/bin/sh
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
binary_path=$(mktemp "${TMPDIR:-/tmp}/tab-firmware-core.XXXXXX")
trap 'rm -f "$binary_path"' EXIT
c++ -std=c++11 -Wall -Wextra -Werror -I "$repo_root/firmware/tab/include" "$repo_root/firmware/tab/tests/test_core.cpp" -o "$binary_path"
"$binary_path"
