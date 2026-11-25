import { Children, cloneElement, Fragment, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

/**
 * Гарчгийн үг бүрийг `.word` болгон, тус бүрийг `.word-mask` дотор боож "дээрээс гарч ирэх" animation-д
 * бэлдэнэ (CSS: `styles/effects.css`). Server component, JS-гүй. Текст өөрчлөгдөхгүй: үгсийн
 * хоорондох хоосон зай хэвээр тул screen reader, хайлт, copy ижил уншина. `t.rich`-ийн өнгөт
 * span (`<g>`) дотор ч үгээр хуваана.
 */
export function SplitWords({ children }: { children: ReactNode }) {
  let index = 0;
  const walk = (node: ReactNode): ReactNode => {
    if (typeof node === "string") {
      return node.split(/(\s+)/).map((part, key) =>
        part === "" || /^\s+$/.test(part) ? (
          part
        ) : (
          <span key={key} className="word-mask">
            <span className="word" style={{ "--w": index++ } as CSSProperties}>
              {part}
            </span>
          </span>
        ),
      );
    }
    if (Array.isArray(node)) return node.map((child, key) => <Fragment key={key}>{walk(child)}</Fragment>);
    if (isValidElement(node)) {
      const element = node as ReactElement<{ children?: ReactNode }>;
      return cloneElement(element, undefined, ...Children.toArray(walk(element.props.children)));
    }
    return node;
  };
  return <>{walk(children)}</>;
}
