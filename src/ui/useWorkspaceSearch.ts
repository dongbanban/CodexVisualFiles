import { useEffect, useState } from "react";
import type { SavedState, SearchResult } from "../shared.js";
import { errorText } from "./file-utils.js";

export function useWorkspaceSearch(
  query: string,
  stored: SavedState,
  changes: string,
  call: <T>(name: string, args: Record<string, unknown>) => Promise<T>,
) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResults([]);
    setTruncated(false);
    setSearchError("");
    setSearching(!!query.trim());
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void call<{ results: SearchResult[]; truncated: boolean }>(
        "visualfiles_read",
        {
          action: "search",
          query,
          mode: stored.searchMode,
          includeIgnored: stored.includeIgnored,
          onlyChanged: stored.onlyChanged,
        },
      )
        .then((data) => {
          if (!cancelled) {
            setResults(data.results);
            setTruncated(data.truncated);
          }
        })
        .catch((error) => {
          if (!cancelled) setSearchError(errorText(error));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    query,
    stored.searchMode,
    stored.includeIgnored,
    stored.onlyChanged,
    stored.onlyChanged ? changes : "",
    call,
    retry,
  ]);
  return {
    results,
    truncated,
    searching,
    searchError,
    retrySearch: () => setRetry((old) => old + 1),
  };
}
