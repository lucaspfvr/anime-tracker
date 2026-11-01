import { useEffect, useState } from "react";

/**
 * AniList fornece sinopses normalmente em inglês. Tradução automática é opcional,
 * sob demanda, com cache de sessão, e nunca substitui o texto original caso falhe.
 */
const translationCache = new Map<string, string>();
const failedTranslations = new Set<string>();
const STORAGE_PREFIX = "anime-tracker:ptbr:v1:";

type Translation = {
  text: string;
  loading: boolean;
  translated: boolean;
  failed: boolean;
};
const cleanDescription = (value: string | null | undefined) =>
  (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

function splitByBytes(input: string, maxBytes = 430): string[] {
  const encoder = new TextEncoder();
  const words = input.split(/\s+/).filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (encoder.encode(next).length <= maxBytes) {
      current = next;
      continue;
    }
    if (current) result.push(current);
    current = "";
    // Palavras muito longas: quebrar sem dividir caracteres Unicode.
    for (const letter of Array.from(word)) {
      if (encoder.encode(current + letter).length > maxBytes) {
        if (current) result.push(current);
        current = letter;
      } else current += letter;
    }
  }
  if (current) result.push(current);
  return result;
}

async function requestTranslation(
  input: string,
  signal: AbortSignal,
): Promise<string> {
  const chunks = splitByBytes(input);
  const translated: string[] = [];
  // Sequencial para evitar estourar a cota gratuita ao navegar rapidamente.
  for (const chunk of chunks) {
    const params = new URLSearchParams({ q: chunk, langpair: "en|pt-BR" });
    const response = await fetch(
      `https://api.mymemory.translated.net/get?${params}`,
      { signal },
    );
    if (!response.ok) throw new Error("Serviço de tradução indisponível");
    const body = (await response.json()) as {
      responseStatus?: number;
      responseData?: { translatedText?: string };
    };
    if (body.responseStatus !== 200 || !body.responseData?.translatedText)
      throw new Error("Tradução não disponível");
    translated.push(cleanDescription(body.responseData.translatedText));
  }
  return translated.join(" ").trim();
}

function cached(key: string): string | null {
  const inMemory = translationCache.get(key);
  if (inMemory) return inMemory;
  try {
    const value = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (value) {
      translationCache.set(key, value);
      return value;
    }
  } catch {
    /* storage bloqueado */
  }
  return null;
}

/** maxLength: limita o consumo da API de tradução; sinopses maiores têm versão parcial. */
export function usePortugueseSynopsis(
  id: number | undefined,
  description: string | null | undefined,
  maxLength = 1200,
): Translation {
  const original = cleanDescription(description).slice(0, maxLength);
  const key = `${id || 0}:${maxLength}`;
  const [state, setState] = useState<Translation>({
    text: original,
    loading: false,
    translated: false,
    failed: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    const value = cleanDescription(description).slice(0, maxLength);
    if (!value) {
      setState({ text: "", loading: false, translated: false, failed: false });
      return () => controller.abort();
    }
    if (!/[a-z]/i.test(value)) {
      setState({
        text: value,
        loading: false,
        translated: false,
        failed: false,
      });
      return () => controller.abort();
    }
    const fromCache = cached(key);
    if (fromCache) {
      setState({
        text: fromCache,
        loading: false,
        translated: true,
        failed: false,
      });
      return () => controller.abort();
    }
    if (failedTranslations.has(key)) {
      setState({
        text: value,
        loading: false,
        translated: false,
        failed: true,
      });
      return () => controller.abort();
    }
    // Evita traduzir uma sinopse que já foi escrita em português.
    const looksPortuguese =
      /\b(não|você|então|história|personagem|enquanto|porém|também|após)\b/i.test(
        value,
      );
    if (looksPortuguese) {
      setState({
        text: value,
        loading: false,
        translated: false,
        failed: false,
      });
      return () => controller.abort();
    }
    setState({ text: value, loading: true, translated: false, failed: false });
    void requestTranslation(value, controller.signal)
      .then((pt) => {
        if (!pt || controller.signal.aborted) return;
        translationCache.set(key, pt);
        try {
          sessionStorage.setItem(STORAGE_PREFIX + key, pt);
        } catch {
          /* modo privado */
        }
        setState({ text: pt, loading: false, translated: true, failed: false });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        failedTranslations.add(key);
        setState({
          text: value,
          loading: false,
          translated: false,
          failed: true,
        });
      });
    return () => controller.abort();
  }, [id, description, maxLength, key]);
  return state;
}
