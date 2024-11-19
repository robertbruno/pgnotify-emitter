
# Descripción de las opciones establecidas
#
# -e  Termina inmediatamente si una orden termina con un estado diferente a cero.

set -e

# Si la variable DEBUG existe, se mostraran las órdenes y sus argumentos mientras se ejecutan.
[ -n "${DEBUG:-}" ] && set -x

export START_TIME=${START_TIME:-$(date +%s)}

## Setting message text color only if supported
if [ "${TERM}" == "xterm-256color" ]; then
  if ! command -v tput >/dev/null 2>&1 ; then
    yellow="\e[33m"
    red="\e[31m"
    green="\e[32m"
    reset="\e[0m"
  else    
      yellow=`tput setaf 3`
      red=`tput setaf 1`
      green=`tput setaf 2`
      reset=`tput sgr0`
  fi
fi

## show success message
success () {
    echo "${green}${1}${reset}"
}

## show info message
info () {
    echo "${yellow}${1}${reset}"
}

## show error message
error () {
    echo "${red}${1}${reset}"
}

## print script finished stats
finished () {
  END_TIME=$(date +%s)
  ELAPSED_TIME="Elapsed Time: $(($END_TIME-$START_TIME)) seconds"
 
  if [ $1 -eq 0 ]; then
    success "Finished 🥳 !! ${ELAPSED_TIME}"
  else
    error "Upps 🥵 !! ${ELAPSED_TIME}"
  fi
}

# mensaje indicativo de que el usario a finalizado el script
interrupt () {
  info " 😁 -> [Interrupted by user] <- 😁 "
  exit 1
}