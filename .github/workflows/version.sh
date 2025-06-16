#!/bin/bash

# This produces a semver compatible version number from "git describe" output.

GIT_DESCRIBE=$(git describe --tags --long 2>/dev/null || echo "v0.0.0-0-g$(git rev-parse --short HEAD)")

GIT_COMMITS=$(echo "${GIT_DESCRIBE}" | awk -F - '{ print $2 }')
GIT_SHA=$(echo "${GIT_DESCRIBE}" | awk -F - '{ print $3 }' | sed 's/^g//')
GIT_TAG=$(echo "${GIT_DESCRIBE}" | awk -F - '{ print $1 }')

# Removed dirty check for cleaner version numbers
# [ -z "$(git status --porcelain)" ] || GIT_TAG="${GIT_TAG}-dirty"

if [ "$GIT_COMMITS" = "0" ]; then
  VERSION="${GIT_TAG}"
else
  VERSION="${GIT_TAG}-${GIT_COMMITS}.${GIT_SHA}"
fi

# Remove 'v' prefix for cleaner version numbers
VERSION="${VERSION#v}"

echo "VERSION=$VERSION"
