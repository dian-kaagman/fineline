import { Fragment, type ReactNode } from "react";
import { en, type MessageKey } from "./en";

/** Like t(), but placeholders may be filled with elements (e.g. a link), keeping the sentence whole. */
export function tNodes(key: MessageKey, params: Record<string, ReactNode>): ReactNode {
  const text: string = en[key];
  return text.split(/(\{\w+\})/).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{name && name in params ? params[name] : part}</Fragment>;
  });
}
