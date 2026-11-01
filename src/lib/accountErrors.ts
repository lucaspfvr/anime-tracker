export const errorMessage = (error: unknown): string => {
  const info = error as { message?: string; code?: string };
  if (info?.code === "23505")
    return "Esse @usuário já está em uso. Escolha outro.";
  return info?.message || "Não foi possível concluir a operação.";
};
