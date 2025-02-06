#!/bin/bash

i=10
while [ $i -le 22 ]; do
  Xvfb :$i -screen 0 1920x1080x24 &
  i=$((i + 1))
done