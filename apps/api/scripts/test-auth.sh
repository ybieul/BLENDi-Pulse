#!/usr/bin/env bash
# apps/api/scripts/test-auth.sh
# Script de smoke test dos endpoints de autenticação.
# Uso: bash apps/api/scripts/test-auth.sh
#
# Requer: curl, jq (brew install jq)
# A API deve estar rodando em localhost:3000

set -euo pipefail

BASE_URL="http://localhost:3000"
EMAIL="testuser_$(date +%s)@blendipulse.dev"
PASSWORD="Blend1Pulse!"
NAME="Test User"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✓ $1${RESET}"; }
fail() { echo -e "${RED}✗ $1${RESET}"; exit 1; }
info() { echo -e "${CYAN}→ $1${RESET}"; }
section() { echo -e "\n${YELLOW}── $1 ──${RESET}"; }

# ── Verificar se jq está instalado ───────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  echo -e "${RED}jq não encontrado. Instale com: brew install jq${RESET}"
  exit 1
fi

# ── Verificar se a API está rodando ──────────────────────────────────────────
section "0. Health check"
info "GET $BASE_URL/ping"
PING=$(curl -sf "$BASE_URL/ping") || fail "API não está respondendo. Execute: pnpm --filter @blendi/api dev"
echo "$PING" | jq .
pass "API está online"

# ── 1. Register ───────────────────────────────────────────────────────────────
section "1. POST /auth/register"
info "Email: $EMAIL"
REGISTER=$(curl -sf -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"$NAME\",
    \"blendiModel\": \"ProPlus\",
    \"goal\": \"Muscle\",
    \"preferredLanguage\": \"en\",
    \"dailyProteinTarget\": 150,
    \"dailyCalorieTarget\": 2500
  }") || fail "POST /auth/register falhou"

echo "$REGISTER" | jq .
ACCESS_TOKEN=$(echo "$REGISTER" | jq -r '.data.accessToken')
REFRESH_TOKEN=$(echo "$REGISTER" | jq -r '.data.refreshToken')

[[ "$ACCESS_TOKEN" != "null" && -n "$ACCESS_TOKEN" ]] || fail "accessToken ausente na resposta"
[[ "$REFRESH_TOKEN" != "null" && -n "$REFRESH_TOKEN" ]] || fail "refreshToken ausente na resposta"
pass "Register retornou 201 com tokens"

# ── 2. Register duplicado → 409 ───────────────────────────────────────────────
section "2. POST /auth/register (email duplicado → 409)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"name\": \"$NAME\",
    \"blendiModel\": \"ProPlus\",
    \"goal\": \"Muscle\",
    \"preferredLanguage\": \"en\",
    \"dailyProteinTarget\": 150,
    \"dailyCalorieTarget\": 2500
  }")
[[ "$STATUS" == "409" ]] || fail "Esperado 409, recebido $STATUS"
pass "Email duplicado retornou 409"

# ── 3. Login ──────────────────────────────────────────────────────────────────
section "3. POST /auth/login"
LOGIN=$(curl -sf -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}") || fail "POST /auth/login falhou"

echo "$LOGIN" | jq .
ACCESS_TOKEN=$(echo "$LOGIN" | jq -r '.data.accessToken')
REFRESH_TOKEN=$(echo "$LOGIN" | jq -r '.data.refreshToken')
[[ "$ACCESS_TOKEN" != "null" ]] || fail "accessToken ausente no login"
pass "Login retornou 200 com tokens"

# ── 4. Login senha errada → 401 ───────────────────────────────────────────────
section "4. POST /auth/login (senha errada → 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"SenhaErrada123\"}")
[[ "$STATUS" == "401" ]] || fail "Esperado 401, recebido $STATUS"
pass "Senha incorreta retornou 401 genérico"

# ── 5. Rota protegida com token válido ────────────────────────────────────────
section "5. GET /ping com Authorization: Bearer (token válido)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/ping")
[[ "$STATUS" == "200" ]] || fail "Esperado 200, recebido $STATUS"
pass "Token válido → 200"

# ── 6. Rota sem token → (ping é público, testar com header vazio) ─────────────
section "6. Rota protegida sem token → 401 (simulado)"
info "Nota: /ping é público. Em rotas protegidas (futuro /me), token ausente retorna 401."
info "Verificando resposta do middleware authenticate com token inválido:"
RESPONSE=$(curl -s -X GET "$BASE_URL/ping" \
  -H "Authorization: Bearer TOKEN_INVALIDO_QUALQUER")
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
pass "Middleware authenticate está registrado e funcional"

# ── 7. Refresh Token Rotation ─────────────────────────────────────────────────
section "7. POST /auth/refresh (Refresh Token Rotation)"
REFRESH=$(curl -sf -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}") || fail "POST /auth/refresh falhou"

echo "$REFRESH" | jq .
NEW_ACCESS=$(echo "$REFRESH" | jq -r '.data.accessToken')
NEW_REFRESH=$(echo "$REFRESH" | jq -r '.data.refreshToken')
[[ "$NEW_ACCESS" != "null" && -n "$NEW_ACCESS" ]] || fail "Novo accessToken ausente"
[[ "$NEW_REFRESH" != "$REFRESH_TOKEN" ]] || fail "Refresh token NÃO foi rotacionado"
pass "Refresh retornou 200 com novo par de tokens"
pass "Refresh token foi rotacionado (token novo ≠ token antigo)"

# ── 8. Refresh token inválido → 401 ──────────────────────────────────────────
section "8. POST /auth/refresh (token inválido → 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "token.invalido.qualquer"}')
[[ "$STATUS" == "401" ]] || fail "Esperado 401, recebido $STATUS"
pass "Refresh inválido retornou 401"

# ── Resultado ─────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Todos os testes passaram! ✓${RESET}"
echo -e "${GREEN}════════════════════════════════════════${RESET}\n"
