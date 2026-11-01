import assert from "node:assert/strict";
import { test } from "node:test";
import { profilePath, readProfileUsername } from "../src/lib/profileRoutes.ts";

test("link compartilhado funciona ao abrir diretamente e com barra final", () => {
  assert.equal(
    readProfileUsername("https://teste.vercel.app" + profilePath("lucaspfvr")),
    "lucaspfvr",
  );
  assert.equal(
    readProfileUsername("https://teste.vercel.app/@LucasPFVR/"),
    "lucaspfvr",
  );
});
test("links antigos continuam resolvendo o mesmo usuário", () => {
  assert.equal(
    readProfileUsername("https://teste.vercel.app/?perfil=lucaspfvr"),
    "lucaspfvr",
  );
});
test("rejeita identificadores inválidos sem quebrar a aplicação", () => {
  for (const path of [
    "/",
    "/@ab",
    "/@lucas/outro",
    "/@%ZZ",
    "/?perfil=",
    "/?perfil=nome%40email.com",
  ]) {
    assert.equal(readProfileUsername("https://teste.vercel.app" + path), null);
  }
});
