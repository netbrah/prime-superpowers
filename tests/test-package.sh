#!/usr/bin/env bash
set -uo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/.." && pwd)
plan=$root/docs/specs/2026-08-26-prime-superpowers-implementation-plan.md

declare -a assertion_types=()
declare -a assertion_paths=()
declare -a assertion_tasks=()
current_task=

register_assertion() {
  local type=$1 path=$2
  if [[ -z $current_task ]]; then
    printf 'package manifest registration outside a fragment\n' >&2
    exit 2
  fi
  assertion_types+=("$type")
  assertion_paths+=("$path")
  assertion_tasks+=("$current_task")
}

package_file() { register_assertion file "$1"; }
package_executable() { register_assertion executable "$1"; }
package_directory() { register_assertion directory "$1"; }

mapfile -d '' fragments < <(
  find "$script_dir/package-manifest.d" -maxdepth 1 -type f -name '*.sh' -print0 2>/dev/null |
    sort -z
)

for fragment in "${fragments[@]}"; do
  name=${fragment##*/}
  prefix=${name%%-*}
  [[ $prefix =~ ^[0-9][0-9]$ ]] || {
    printf 'invalid package manifest fragment name: %s\n' "$name" >&2
    exit 2
  }
  current_task=$((10#$prefix))
  # shellcheck source=/dev/null
  source "$fragment"
done
current_task=

printf 'TAP version 13\n'
if ((${#assertion_paths[@]} == 0)); then
  printf '1..0 # SKIP no package assertions registered\n'
  exit 0
fi
printf '1..%d\n' "${#assertion_paths[@]}"

failures=0
for index in "${!assertion_paths[@]}"; do
  number=$((index + 1))
  type=${assertion_types[$index]}
  relative=${assertion_paths[$index]}
  task=${assertion_tasks[$index]}
  owned=0

  if [[ $relative != /* && $relative != ./* && $relative != *"/../"* && $relative != ../* ]]; then
    files_line=$(awk -v heading="## Task $task:" '
      index($0, heading) == 1 { in_task=1; next }
      in_task && /^## Task / { exit }
      in_task && /^\*\*Files:\*\*/ { print; exit }
    ' "$plan")
    rest=$files_line
    while [[ $rest =~ \`([^\`]*)\` ]]; do
      allowed=${BASH_REMATCH[1]}
      rest=${rest#*"${BASH_REMATCH[0]}"}
      normalized=${allowed%/}
      normalized=${normalized%/\*\*}
      if [[ $relative == "$normalized" ]]; then
        owned=1
        break
      fi
      if [[ ($allowed == */ || $allowed == */\*\*) && $relative == "$normalized/"* ]]; then
        owned=1
        break
      fi
    done
  fi

  description="Task $task owns $relative as $type"
  if ((owned == 0)); then
    printf 'not ok %d - %s\n' "$number" "$description"
    printf '  ---\n  code: E_PACKAGE_OWNERSHIP\n  ...\n'
    failures=$((failures + 1))
    continue
  fi

  case "$type" in
    file) [[ -f "$root/$relative" ]] ;;
    executable) [[ -f "$root/$relative" && -x "$root/$relative" ]] ;;
    directory) [[ -d "$root/$relative" ]] ;;
    *) false ;;
  esac
  if (($? == 0)); then
    printf 'ok %d - %s\n' "$number" "$description"
  else
    printf 'not ok %d - %s\n' "$number" "$description"
    printf '  ---\n  code: E_PACKAGE_PATH\n  ...\n'
    failures=$((failures + 1))
  fi
done

exit "$((failures != 0))"
