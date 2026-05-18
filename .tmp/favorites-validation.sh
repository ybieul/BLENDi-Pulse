#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq não encontrado"
  exit 1
fi

BASE_URL="http://localhost:3000"
if ! curl -sf "$BASE_URL/ping" >/dev/null 2>&1; then
  BASE_URL="http://192.168.10.127:3000"
fi

echo "BASE_URL=$BASE_URL"
curl -sf "$BASE_URL/ping" | jq .

TS=$(date +%s)
EMAIL1="favorite_user1_${TS}@blendipulse.dev"
EMAIL2="favorite_user2_${TS}@blendipulse.dev"
PASSWORD="Blend1Pulse!"
NAME1="Favorite User 1"
NAME2="Favorite User 2"

register_user() {
  local email="$1"
  local name="$2"

  curl -sf -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc \
      --arg email "$email" \
      --arg password "$PASSWORD" \
      --arg name "$name" \
      '{email: $email, password: $password, name: $name, blendiModel: "ProPlus", goal: "Muscle", preferredLanguage: "en", timezone: "America/Sao_Paulo", dailyProteinTarget: 150, dailyCalorieTarget: 2500}')"
}

USER1=$(register_user "$EMAIL1" "$NAME1")
TOKEN1=$(printf '%s' "$USER1" | jq -r '.data.accessToken')
USER2=$(register_user "$EMAIL2" "$NAME2")
TOKEN2=$(printf '%s' "$USER2" | jq -r '.data.accessToken')

[[ -n "$TOKEN1" && "$TOKEN1" != "null" ]] || { echo "Falha token user1"; exit 1; }
[[ -n "$TOKEN2" && "$TOKEN2" != "null" ]] || { echo "Falha token user2"; exit 1; }

echo "USER1=$EMAIL1"
echo "USER2=$EMAIL2"

RECIPE_1=$(jq -nc '{recipeName: "Berry Protein Blast", ingredients: [{name: "Banana", amount: "1 unit"}, {name: "Blueberries", amount: "100 g"}, {name: "Whey Protein", amount: "30 g"}], protein: 32, carbs: 45, fat: 12, calories: 410, prepTimeSeconds: 90, blendInstruction: "Blend everything until smooth.", tip: "Use frozen fruit for a thicker texture.", hasSubstitutes: true}')
RECIPE_2=$(jq -nc '{recipeName: "Mango Recovery Boost", ingredients: [{name: "Mango", amount: "150 g"}, {name: "Greek Yogurt", amount: "170 g"}, {name: "Oats", amount: "30 g"}], protein: 24, carbs: 39, fat: 6, calories: 300, prepTimeSeconds: 75, blendInstruction: "Blend until creamy.", tip: "Add ice for a colder drink.", hasSubstitutes: false}')

TMP1=$(mktemp)
TMP2=$(mktemp)
TMP3=$(mktemp)
TMP4=$(mktemp)
TMP5=$(mktemp)
TMP6=$(mktemp)
TMP7=$(mktemp)
trap 'rm -f "$TMP1" "$TMP2" "$TMP3" "$TMP4" "$TMP5" "$TMP6" "$TMP7"' EXIT

POST1_STATUS=$(curl -s -o "$TMP1" -w '%{http_code}' -X POST "$BASE_URL/favorites" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN1" -d "$RECIPE_1")
POST1_ID=$(jq -r '.data.favorite.id' "$TMP1")
POST1_EXISTS=$(jq -r '.data.alreadyExists' "$TMP1")
echo "POST /favorites #1 => status=$POST1_STATUS alreadyExists=$POST1_EXISTS id=$POST1_ID"
jq '{success, data: {alreadyExists: .data.alreadyExists, favorite: {id: .data.favorite.id, recipeName: .data.favorite.recipeName}}}' "$TMP1"
[[ "$POST1_STATUS" == "201" ]] || { echo "Esperado 201 no primeiro POST"; exit 1; }
[[ "$POST1_EXISTS" == "false" ]] || { echo "Esperado alreadyExists=false no primeiro POST"; exit 1; }

POST2_STATUS=$(curl -s -o "$TMP2" -w '%{http_code}' -X POST "$BASE_URL/favorites" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN1" -d "$RECIPE_1")
POST2_ID=$(jq -r '.data.favorite.id' "$TMP2")
POST2_EXISTS=$(jq -r '.data.alreadyExists' "$TMP2")
echo "POST /favorites #2 => status=$POST2_STATUS alreadyExists=$POST2_EXISTS id=$POST2_ID"
jq '{success, data: {alreadyExists: .data.alreadyExists, favorite: {id: .data.favorite.id, recipeName: .data.favorite.recipeName}}}' "$TMP2"
[[ "$POST2_STATUS" == "200" ]] || { echo "Esperado 200 no POST duplicado"; exit 1; }
[[ "$POST2_EXISTS" == "true" ]] || { echo "Esperado alreadyExists=true no POST duplicado"; exit 1; }
[[ "$POST1_ID" == "$POST2_ID" ]] || { echo "Esperado mesmo documento no POST duplicado"; exit 1; }

GET_STATUS=$(curl -s -o "$TMP3" -w '%{http_code}' -H "Authorization: Bearer $TOKEN1" "$BASE_URL/favorites")
GET_TOTAL=$(jq -r '.data.total' "$TMP3")
GET_LEN=$(jq -r '.data.favorites | length' "$TMP3")
GET_FIRST_ID=$(jq -r '.data.favorites[0].id' "$TMP3")
echo "GET /favorites => status=$GET_STATUS total=$GET_TOTAL length=$GET_LEN firstId=$GET_FIRST_ID"
jq '{success, data: {total: .data.total, favorites: [.data.favorites[] | {id, recipeName}]}}' "$TMP3"
[[ "$GET_STATUS" == "200" ]] || { echo "Esperado 200 no GET"; exit 1; }
[[ "$GET_TOTAL" == "1" ]] || { echo "Esperado total=1"; exit 1; }
[[ "$GET_LEN" == "1" ]] || { echo "Esperado array com 1 favorito"; exit 1; }
[[ "$GET_FIRST_ID" == "$POST1_ID" ]] || { echo "Esperado favorito criado no GET"; exit 1; }

DELETE_OK_STATUS=$(curl -s -o "$TMP4" -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN1" "$BASE_URL/favorites/$POST1_ID")
echo "DELETE /favorites/:id correto => status=$DELETE_OK_STATUS"
jq . "$TMP4"
[[ "$DELETE_OK_STATUS" == "200" ]] || { echo "Esperado 200 no DELETE correto"; exit 1; }

NONEXISTENT_ID="507f1f77bcf86cd799439011"
DELETE_404_STATUS=$(curl -s -o "$TMP5" -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN1" "$BASE_URL/favorites/$NONEXISTENT_ID")
echo "DELETE /favorites/:id inexistente => status=$DELETE_404_STATUS"
jq . "$TMP5"
[[ "$DELETE_404_STATUS" == "404" ]] || { echo "Esperado 404 no DELETE inexistente"; exit 1; }

POST3_STATUS=$(curl -s -o "$TMP6" -w '%{http_code}' -X POST "$BASE_URL/favorites" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN1" -d "$RECIPE_2")
POST3_ID=$(jq -r '.data.favorite.id' "$TMP6")
[[ "$POST3_STATUS" == "201" ]] || { echo "Esperado 201 ao recriar favorito para teste 403"; exit 1; }

DELETE_403_STATUS=$(curl -s -o "$TMP7" -w '%{http_code}' -X DELETE -H "Authorization: Bearer $TOKEN2" "$BASE_URL/favorites/$POST3_ID")
echo "DELETE /favorites/:id com outro usuário => status=$DELETE_403_STATUS"
jq . "$TMP7"
[[ "$DELETE_403_STATUS" == "403" ]] || { echo "Esperado 403 no DELETE com outro usuário"; exit 1; }

echo "RESULTADO_BACKEND=OK"
