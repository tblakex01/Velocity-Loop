export type User = { id: string; username: string };
export type Standing = {
  rank: number;
  username: string;
  time: number;
  carId: string;
  createdAt: string;
};
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The racing service is unavailable." }));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "The racing service is unavailable.",
      response.status,
    );
  return data as T;
}
