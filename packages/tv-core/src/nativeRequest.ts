/** Native Window.fetch is receiver-checked in browsers, unlike Node's fetch.
 * Never invoke a stored native function with TvSession as its receiver.
 * Keep the injected transport for tests/platform adapters; no CORS/TLS bypass.
 */
export function invokeTvRequest(request: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return request.call(typeof window === 'undefined' ? undefined : window, input, init);
}
