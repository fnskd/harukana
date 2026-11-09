#!/usr/bin/env bash
# 하루가나 APK 만들기
#   사용법: HARUKANA_KEYSTORE_PASSWORD='서명키 비밀번호' ./build-apk.sh
#   결과:   ../apk/harukana.apk
# 필요한 것: JDK 17 이상, Gradle 8.13 이상, Android SDK (platforms;android-35, build-tools;35.0.0)
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${HARUKANA_KEYSTORE_PASSWORD:-}" ]; then
  echo "서명키 비밀번호가 필요해요: HARUKANA_KEYSTORE_PASSWORD='비밀번호' ./build-apk.sh" >&2
  exit 1
fi
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
echo "sdk.dir=$ANDROID_HOME" > local.properties

gradle --no-daemon -q assembleRelease

mkdir -p ../apk
cp app/build/outputs/apk/release/app-release.apk ../apk/harukana.apk
echo "완성: $(cd .. && pwd)/apk/harukana.apk"
