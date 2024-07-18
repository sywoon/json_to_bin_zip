#!/bin/sh
clear

script_dir="$(dirname "$(realpath "$0")")"
param_path="$script_dir/"
node main.js "$param_path"
