import { useRef, useState } from "react";
import type { DefinitionLocation } from "../shared.js";

export function useCodeNavigation(
  open: (location: DefinitionLocation) => Promise<boolean>,
  onError: (error: unknown) => void,
) {
  const history = useRef({
    back: [] as DefinitionLocation[],
    forward: [] as DefinitionLocation[],
  });
  const busy = useRef(false);
  const [available, setAvailable] = useState({ back: false, forward: false });
  const publish = () =>
    setAvailable({
      back: !!history.current.back.length,
      forward: !!history.current.forward.length,
    });
  const jump = async (
    target: DefinitionLocation,
    origin: DefinitionLocation,
  ) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!(await open(target))) return;
      if (
        target.path !== origin.path ||
        target.version !== origin.version ||
        target.from !== origin.from ||
        target.to !== origin.to
      ) {
        history.current.back.push(origin);
        history.current.forward = [];
        publish();
      }
    } catch (error) {
      onError(error);
    } finally {
      busy.current = false;
    }
  };
  const navigate = async (
    direction: "back" | "forward",
    origin: DefinitionLocation,
  ) => {
    const target = history.current[direction].at(-1);
    if (!target || busy.current) return;
    busy.current = true;
    try {
      if (!(await open(target))) return;
      history.current[direction].pop();
      history.current[direction === "back" ? "forward" : "back"].push(origin);
      publish();
    } catch (error) {
      onError(error);
    } finally {
      busy.current = false;
    }
  };
  return { ...available, jump, navigate };
}

export type CodeNavigation = ReturnType<typeof useCodeNavigation>;
