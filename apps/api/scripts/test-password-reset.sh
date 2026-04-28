#!/usr/bin/env bash
# ─── BLENDi Pulse — Password Reset Flow E2E Test ───────────────────────────
# Testa o fluxo completo de redefinição de senha via OTP.
# Uso: bash scripts/test-password-reset.sh <email-cadastrado> <senha-atual>
#
# O script inicia o servidor internamente com output em /tmp/blendi-api.log,
# extrai o OTP automaticamente do log e executa todos os cenários sem input.
#
# Pré-requisito: usuário cadastrado no MongoDB
#
# Cenários cobertos:
#   1. forgot-password com e-mail cadastrado (OTP no log do servidor)
#   2. forgot-password com e-mail inexistente (resposta idêntica ao caso 1)
#   3. verify-otp com OTP correto → resetToken
#   4. verify-otp com OTP incorreto → 400
#   5. verify-otp 6x com OTP incorreto → bloqueio na 6ª tentativa
#   6. reset-password com resetToken válido → 200
#   7. login com nova senha → 200 / login com senha antiga → 401
#   8. reset-password com o mesmo resetToken → 401 (token já usado)
#   9. Limpeza: restaura senha original automaticamente
# ───────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="http://localhost:3000/auth"
EXISTING_EMAIL="${1:-}"
CURRENT_PASSWORD="${2:-}"
LOG_FILE="/tmp/blendi-api.log"

if [[ -z "$EXISTING_EMAIL" || -z "$CURRENT_PASSWORD" ]]; then
  echo "Uso: bash scripts/test-password-reset.sh <email-cadastrado> <senha-atual>"
  exit 1
fi

NEW_PASSWORD="NewTestP@ss2026!"

# ─── Helpers ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "${GREEN}  ✅ PASS${RESET} — $1"; }
fail() { echo -e "${RED}  ❌ FAIL${RESET} — $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}  ℹ  ${RESET}$1"; }
section() { echo -e "\n${BOLD}${YELLOW}══ $1 ══${RESET}"; }

FAILURES=0
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

check_status() {
  local label="$1" expected="$2" actual="$3" body="$4"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — esperado HTTP $expected, recebido HTTP $actual — body: $body"
  fi
}

check_field() {
  local label="$1" field="$2" body="$3"
  if echo "$body" | grep -q "\"$field\""; then
    pass "$label (campo '$field' presente)"
  else
    fail "$label — campo '$field' não encontrado — body: $body"
  fi
}

# Extrai OTP mais recente do log do servidor a partir da linha $from_line.
# Nunca retorna exit code 1 — compatível com set -e.
wait_for_otp() {
  local email="$1"
  local from_line="${2:-1}"
  local attempts=0
  local otp=""
  while [[ $attempts -lt 30 ]]; do
    otp=$(tail -n +"$from_line" "$LOG_FILE" 2>/dev/null \
          | grep -oE "Password reset OTP for[^:]+<${email}>: [0-9]{6}" \
          | tail -1 \
          | grep -oE '[0-9]{6}$' || true)
    if [[ -n "$otp" ]]; then
      echo "$otp"
      return 0
    fi
    sleep 0.5
    attempts=$((attempts + 1))
  done
  echo ""
  return 0  # Não falhar com set -e — o chamador verifica se string está vazia
}

# ─── Iniciar servidor ─────────────────────────────────────────────────────────

section "Setup — Iniciar servidor"

# Matar qualquer instância anterior
kill "$(lsof -ti :3000)" 2>/dev/null || true
sleep 1

truncate -s 0 "$LOG_FILE" 2>/dev/null || true

cd "$(dirname "$0")/.."
pnpm dev > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
info "Servidor PID=$SERVER_PID, log: $LOG_FILE"

# Aguardar servidor pronto
attempts=0
while ! curl -sf http://localhost:3000/ping > /dev/null 2>&1; do
  sleep 1
  attempts=$((attempts + 1))
  if [[ $attempts -gt 20 ]]; then
    fail "Servidor não subiu em 20s"
    cat "$LOG_FILE"
    exit 1
  fi
done
pass "Servidor pronto (${attempts}s)"

# ─── 1. forgot-password: e-mail CADASTRADO ───────────────────────────────────

section "1. POST /auth/forgot-password — e-mail CADASTRADO"

# Marcar posição atual do log antes da requisição
LOG_LINE1=$(wc -l < "$LOG_FILE")

RESP1=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\"}")
BODY1=$(echo "$RESP1" | head -n1)
CODE1=$(echo "$RESP1" | tail -n1)

check_status "forgot-password (e-mail cadastrado)" "200" "$CODE1" "$BODY1"
check_field  "campo 'message' presente" "message" "$BODY1"

# Aguardar OTP aparecer no log (fire-and-forget é assíncrono)
OTP1=$(wait_for_otp "$EXISTING_EMAIL" "$((LOG_LINE1 + 1))")
if [[ -n "$OTP1" ]]; then
  pass "OTP apareceu no log do servidor: $OTP1"
else
  fail "OTP não apareceu no log do servidor após 15s"
  info "Log do servidor:"
  cat "$LOG_FILE"
fi

info "Resposta: $BODY1"

# ─── 2. forgot-password: e-mail INEXISTENTE ──────────────────────────────────

section "2. POST /auth/forgot-password — e-mail INEXISTENTE"

RESP2=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email": "naoexiste@exemplo.com"}')
BODY2=$(echo "$RESP2" | head -n1)
CODE2=$(echo "$RESP2" | tail -n1)

check_status "forgot-password (e-mail inexistente)" "200" "$CODE2" "$BODY2"

if [[ "$BODY1" == "$BODY2" ]]; then
  pass "Resposta idêntica — email enumeration prevention OK"
else
  fail "Respostas DIFERENTES — email existente vs inexistente"
  info "cadastrado:  $BODY1"
  info "inexistente: $BODY2"
fi

# ─── 3. verify-otp: OTP CORRETO ──────────────────────────────────────────────

section "3. POST /auth/verify-otp — OTP CORRETO"

if [[ -z "$OTP1" ]]; then
  fail "Sem OTP disponível — abortando cenários 3-8"
  exit 1
fi

RESP3=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"$OTP1\"}")
BODY3=$(echo "$RESP3" | head -n1)
CODE3=$(echo "$RESP3" | tail -n1)

check_status "verify-otp (OTP correto)" "200" "$CODE3" "$BODY3"
check_field  "campo 'resetToken' presente" "resetToken" "$BODY3"
info "Resposta: $BODY3"

RESET_TOKEN=$(echo "$BODY3" | sed 's/.*"resetToken":"\([^"]*\)".*/\1/')
info "resetToken: ${RESET_TOKEN:0:50}..."

# ─── 4. verify-otp: OTP INCORRETO (uma vez) ──────────────────────────────────

section "4. POST /auth/verify-otp — OTP INCORRETO (1 tentativa)"

# Gerar novo OTP para o teste de bloqueio
LOG_LINE4=$(wc -l < "$LOG_FILE")
curl -s -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\"}" > /dev/null

OTP2=$(wait_for_otp "$EXISTING_EMAIL" "$((LOG_LINE4 + 1))")
info "Novo OTP para teste de bloqueio: $OTP2"

RESP4=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"000000\"}")
BODY4=$(echo "$RESP4" | head -n1)
CODE4=$(echo "$RESP4" | tail -n1)

check_status "verify-otp (OTP incorreto)" "400" "$CODE4" "$BODY4"
info "Resposta: $BODY4"

# ─── 5. verify-otp: 6 tentativas → bloqueio ──────────────────────────────────

section "5. POST /auth/verify-otp — 6 tentativas incorretas (bloqueio)"
info "Enviando mais 4 tentativas inválidas (total 5 inválidas)..."

for i in $(seq 2 5); do
  R=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"000000\"}")
  info "  Tentativa $i/5 incorreta — HTTP $(echo "$R" | tail -n1)"
done

# 6ª tentativa com o OTP correto — deve ser bloqueado por MAX_ATTEMPTS
RESP5=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"$OTP2\"}")
BODY5=$(echo "$RESP5" | head -n1)
CODE5=$(echo "$RESP5" | tail -n1)

check_status "OTP correto bloqueado após 5 tentativas inválidas" "400" "$CODE5" "$BODY5"
info "Resposta: $BODY5"

# ─── 6. reset-password: resetToken válido ────────────────────────────────────

section "6. PATCH /auth/reset-password — resetToken válido"

RESP6=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"resetToken\": \"$RESET_TOKEN\", \"newPassword\": \"$NEW_PASSWORD\"}")
BODY6=$(echo "$RESP6" | head -n1)
CODE6=$(echo "$RESP6" | tail -n1)

check_status "reset-password (token válido)" "200" "$CODE6" "$BODY6"
check_field  "campo 'message' presente" "message" "$BODY6"
info "Resposta: $BODY6"

# ─── 7. Login com nova e antiga senha ────────────────────────────────────────

section "7. POST /auth/login — nova senha e senha antiga"

RESP7=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"password\": \"$NEW_PASSWORD\"}")
BODY7=$(echo "$RESP7" | head -n1)
CODE7=$(echo "$RESP7" | tail -n1)

check_status "login com nova senha" "200" "$CODE7" "$BODY7"
check_field  "campo 'accessToken' presente" "accessToken" "$BODY7"

RESP7B=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"password\": \"$CURRENT_PASSWORD\"}")
CODE7B=$(echo "$RESP7B" | tail -n1)

check_status "login com senha ANTIGA rejeitado" "401" "$CODE7B" "$(echo "$RESP7B" | head -n1)"

# ─── 8. Reutilização do resetToken ───────────────────────────────────────────

section "8. PATCH /auth/reset-password — reutilização do mesmo token"

RESP8=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"resetToken\": \"$RESET_TOKEN\", \"newPassword\": \"AnotherP@ss2026!\"}")
BODY8=$(echo "$RESP8" | head -n1)
CODE8=$(echo "$RESP8" | tail -n1)

check_status "reutilização do resetToken → 401" "401" "$CODE8" "$BODY8"
info "Resposta: $BODY8"

# ─── 9. Restaurar senha original ─────────────────────────────────────────────

section "9. Limpeza — restaurar senha original"

LOG_LINE9=$(wc -l < "$LOG_FILE")
curl -s -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\"}" > /dev/null

OTP_RESTORE=$(wait_for_otp "$EXISTING_EMAIL" "$((LOG_LINE9 + 1))")

RESTORE_RESP=$(curl -s -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"$OTP_RESTORE\"}")
RESTORE_TOKEN=$(echo "$RESTORE_RESP" | sed 's/.*"resetToken":"\([^"]*\)".*/\1/')

FINAL=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"resetToken\": \"$RESTORE_TOKEN\", \"newPassword\": \"$CURRENT_PASSWORD\"}")
FINAL_CODE=$(echo "$FINAL" | tail -n1)

if [[ "$FINAL_CODE" == "200" ]]; then
  pass "Senha original restaurada com sucesso"
else
  fail "Falha ao restaurar senha original (HTTP $FINAL_CODE)"
  info "Senha atual da conta: $NEW_PASSWORD"
fi

# ─── Resultado final ──────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}══════════════════════════════════════${RESET}"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✅ TODOS OS TESTES PASSARAM (8/8)${RESET}"
else
  echo -e "${RED}${BOLD}  ❌ $FAILURES TESTE(S) FALHARAM${RESET}"
fi
echo -e "${BOLD}══════════════════════════════════════${RESET}"
echo ""

exit $FAILURES

# ─── BLENDi Pulse — Password Reset Flow E2E Test ───────────────────────────
# Testa o fluxo completo de redefinição de senha via OTP.
# Uso: bash scripts/test-password-reset.sh <email-cadastrado> <senha-atual>
#
# Pré-requisito: servidor rodando em localhost:3000
#
# Cenários cobertos:
#   1. forgot-password com e-mail cadastrado (OTP no console do servidor)
#   2. forgot-password com e-mail inexistente (resposta idêntica ao caso 1)
#   3. verify-otp com OTP correto → resetToken
#   4. verify-otp com OTP incorreto → 400
#   5. verify-otp 6x com OTP incorreto → bloqueio na 6ª tentativa
#   6. reset-password com resetToken válido → 200
#   7. login com nova senha → 200
#   8. reset-password com o mesmo resetToken → 401 (token já usado)
# ───────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_URL="http://localhost:3000/auth"
EXISTING_EMAIL="${1:-}"
CURRENT_PASSWORD="${2:-}"

if [[ -z "$EXISTING_EMAIL" || -z "$CURRENT_PASSWORD" ]]; then
  echo "Uso: bash scripts/test-password-reset.sh <email-cadastrado> <senha-atual>"
  exit 1
fi

NEW_PASSWORD="NewTestP@ss2026!"

# ─── Helpers ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

pass() { echo -e "${GREEN}  ✅ PASS${RESET} — $1"; }
fail() { echo -e "${RED}  ❌ FAIL${RESET} — $1"; FAILURES=$((FAILURES + 1)); }
info() { echo -e "${CYAN}  ℹ  ${RESET}$1"; }
section() { echo -e "\n${BOLD}${YELLOW}══ $1 ══${RESET}"; }

FAILURES=0

check_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  local body="$4"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — esperado HTTP $expected, recebido HTTP $actual"
    echo -e "     body: $body"
  fi
}

check_field() {
  local label="$1"
  local field="$2"
  local body="$3"
  if echo "$body" | grep -q "\"$field\""; then
    pass "$label (campo '$field' presente)"
  else
    fail "$label — campo '$field' não encontrado"
    echo -e "     body: $body"
  fi
}

check_no_field() {
  local label="$1"
  local field="$2"
  local body="$3"
  if echo "$body" | grep -q "\"$field\""; then
    fail "$label — campo '$field' não deveria estar presente"
    echo -e "     body: $body"
  else
    pass "$label (campo '$field' ausente — correto)"
  fi
}

# ─── Pré-requisito: registrar usuário de teste se necessário ─────────────────

section "Pré-requisito: garantir usuário cadastrado"

PING=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/../ping")
if [[ "$PING" != "200" ]]; then
  echo -e "${RED}❌ Servidor não está respondendo em $BASE_URL/../ping${RESET}"
  exit 1
fi
info "Servidor OK"

# ─── 1. forgot-password: e-mail CADASTRADO ───────────────────────────────────

section "1. POST /auth/forgot-password — e-mail CADASTRADO"
info ">>> Observe o console do servidor para ver o OTP aparecer"
info "E-mail: $EXISTING_EMAIL"

RESP1=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\"}")
BODY1=$(echo "$RESP1" | head -n1)
CODE1=$(echo "$RESP1" | tail -n1)

check_status "forgot-password (e-mail cadastrado)" "200" "$CODE1" "$BODY1"
check_field  "campo 'message' presente" "message" "$BODY1"
echo -e "     Resposta: $BODY1"

# ─── 2. forgot-password: e-mail INEXISTENTE — deve ser idêntico ──────────────

section "2. POST /auth/forgot-password — e-mail INEXISTENTE"

RESP2=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d '{"email": "naoexiste@exemplo.com"}')
BODY2=$(echo "$RESP2" | head -n1)
CODE2=$(echo "$RESP2" | tail -n1)

check_status "forgot-password (e-mail inexistente)" "200" "$CODE2" "$BODY2"

if [[ "$BODY1" == "$BODY2" ]]; then
  pass "Resposta idêntica à do e-mail cadastrado (email enumeration prevention)"
else
  fail "Respostas DIFERENTES para e-mail existente vs inexistente!"
  echo -e "     cadastrado:  $BODY1"
  echo -e "     inexistente: $BODY2"
fi

# ─── Extrair OTP do log do servidor ──────────────────────────────────────────

section "Informe o OTP"
echo ""
echo -e "${BOLD}  O OTP de 6 dígitos apareceu no console do servidor acima.${RESET}"
echo -e "  ${YELLOW}Digite o OTP:${RESET} "
read -r OTP_CORRECT

# ─── 3. verify-otp: OTP CORRETO ──────────────────────────────────────────────

section "3. POST /auth/verify-otp — OTP CORRETO"

RESP3=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"$OTP_CORRECT\"}")
BODY3=$(echo "$RESP3" | head -n1)
CODE3=$(echo "$RESP3" | tail -n1)

check_status "verify-otp (OTP correto)" "200" "$CODE3" "$BODY3"
check_field  "campo 'resetToken' presente" "resetToken" "$BODY3"
echo -e "     Resposta: $BODY3"

# Extrair resetToken
RESET_TOKEN=$(echo "$BODY3" | sed 's/.*"resetToken":"\([^"]*\)".*/\1/')
info "resetToken extraído: ${RESET_TOKEN:0:40}..."

# ─── 4. verify-otp: OTP INCORRETO ────────────────────────────────────────────

section "4. POST /auth/verify-otp — OTP INCORRETO (única vez)"
info "Solicitando novo OTP para este teste..."

# Solicitar novo OTP para o teste de tentativas incorretas
curl -s -X POST "$BASE_URL/forgot-password" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\"}" > /dev/null

echo ""
echo -e "  ${YELLOW}Digite o novo OTP gerado (para o teste de bloqueio):${RESET} "
read -r OTP_FOR_BLOCK_TEST

RESP4=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"000000\"}")
BODY4=$(echo "$RESP4" | head -n1)
CODE4=$(echo "$RESP4" | tail -n1)

check_status "verify-otp (OTP incorreto)" "400" "$CODE4" "$BODY4"
echo -e "     Resposta: $BODY4"

# ─── 5. verify-otp: 6 tentativas incorretas → bloqueio ───────────────────────

section "5. POST /auth/verify-otp — 6 tentativas incorretas (bloqueio)"
info "Enviando 5 tentativas inválidas adicionais (total 6 com a acima)..."

LAST_CODE=""
LAST_BODY=""
for i in $(seq 1 5); do
  RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"000000\"}")
  LAST_BODY=$(echo "$RESP" | head -n1)
  LAST_CODE=$(echo "$RESP" | tail -n1)
  info "  Tentativa $((i + 1))/6 — HTTP $LAST_CODE"
done

check_status "6ª tentativa incorreta bloqueada" "400" "$LAST_CODE" "$LAST_BODY"
echo -e "     Resposta final: $LAST_BODY"

# Verificar que o código correto agora também é rejeitado (OTP marcado como esgotado)
RESP_BLOCK=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"$OTP_FOR_BLOCK_TEST\"}")
BODY_BLOCK=$(echo "$RESP_BLOCK" | head -n1)
CODE_BLOCK=$(echo "$RESP_BLOCK" | tail -n1)

check_status "OTP correto bloqueado após 5+ tentativas inválidas" "400" "$CODE_BLOCK" "$BODY_BLOCK"
echo -e "     Resposta: $BODY_BLOCK"

# ─── 6. reset-password: token VÁLIDO ─────────────────────────────────────────

section "6. PATCH /auth/reset-password — resetToken válido"

RESP6=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"resetToken\": \"$RESET_TOKEN\", \"newPassword\": \"$NEW_PASSWORD\"}")
BODY6=$(echo "$RESP6" | head -n1)
CODE6=$(echo "$RESP6" | tail -n1)

check_status "reset-password (token válido)" "200" "$CODE6" "$BODY6"
check_field  "campo 'message' presente" "message" "$BODY6"
echo -e "     Resposta: $BODY6"

# ─── 7. Login com NOVA senha ──────────────────────────────────────────────────

section "7. POST /auth/login — nova senha"

RESP7=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"password\": \"$NEW_PASSWORD\"}")
BODY7=$(echo "$RESP7" | head -n1)
CODE7=$(echo "$RESP7" | tail -n1)

check_status "login com nova senha" "200" "$CODE7" "$BODY7"
check_field  "campo 'accessToken' presente" "accessToken" "$BODY7"
echo -e "     Resposta: ${BODY7:0:120}..."

# Login com senha ANTIGA deve falhar
RESP7B=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"password\": \"$CURRENT_PASSWORD\"}")
CODE7B=$(echo "$RESP7B" | tail -n1)

check_status "login com senha ANTIGA rejeitado" "401" "$CODE7B" "$(echo "$RESP7B" | head -n1)"

# ─── 8. reset-password com token JÁ USADO ────────────────────────────────────

section "8. PATCH /auth/reset-password — token já utilizado (reutilização)"

RESP8=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"resetToken\": \"$RESET_TOKEN\", \"newPassword\": \"AnotherP@ss2026!\"}")
BODY8=$(echo "$RESP8" | head -n1)
CODE8=$(echo "$RESP8" | tail -n1)

check_status "reutilização do resetToken" "401" "$CODE8" "$BODY8"
echo -e "     Resposta: $BODY8"

# ─── Restaurar senha original ─────────────────────────────────────────────────

section "Limpeza — restaurar senha original"
info "Fazendo login com nova senha para obter accessToken..."

LOGIN_RESP=$(curl -s -X POST "$BASE_URL/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EXISTING_EMAIL\", \"password\": \"$NEW_PASSWORD\"}")

echo -e "  ${YELLOW}Restaurar a senha original? (s/N):${RESET} "
read -r RESTORE
if [[ "$RESTORE" =~ ^[Ss]$ ]]; then
  # Solicitar novo OTP para restaurar
  curl -s -X POST "$BASE_URL/forgot-password" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EXISTING_EMAIL\"}" > /dev/null

  echo -e "  ${YELLOW}Digite o OTP para restaurar a senha original:${RESET} "
  read -r RESTORE_OTP

  RESTORE_RESP=$(curl -s -X POST "$BASE_URL/verify-otp" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EXISTING_EMAIL\", \"otp\": \"$RESTORE_OTP\"}")
  RESTORE_TOKEN=$(echo "$RESTORE_RESP" | sed 's/.*"resetToken":"\([^"]*\)".*/\1/')

  FINAL=$(curl -s -w "\n%{http_code}" -X PATCH "$BASE_URL/reset-password" \
    -H "Content-Type: application/json" \
    -d "{\"resetToken\": \"$RESTORE_TOKEN\", \"newPassword\": \"$CURRENT_PASSWORD\"}")
  FINAL_CODE=$(echo "$FINAL" | tail -n1)

  if [[ "$FINAL_CODE" == "200" ]]; then
    pass "Senha original restaurada com sucesso"
  else
    info "Falha ao restaurar (HTTP $FINAL_CODE) — restaure manualmente se necessário"
  fi
else
  info "Senha não restaurada. Senha atual: $NEW_PASSWORD"
fi

# ─── Resultado final ──────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}══════════════════════════════════════${RESET}"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✅ TODOS OS TESTES PASSARAM${RESET}"
else
  echo -e "${RED}${BOLD}  ❌ $FAILURES TESTE(S) FALHARAM${RESET}"
fi
echo -e "${BOLD}══════════════════════════════════════${RESET}"
echo ""

exit $FAILURES
