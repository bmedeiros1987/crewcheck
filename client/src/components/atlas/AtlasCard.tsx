import type { ReactNode } from "react";

/**
 * Card padrão Atlas. Use como base para todos os cards da interface.
 * Substitui gradualmente os cards com padrões visuais divergentes.
 */
export function AtlasCard({
  children,
  className = "",
  as: Tag = "article",
}: {
  children: ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const Component = Tag as any;
  return (
    <Component className={`atlas-card ${className}`.trim()}>
      {children}
    </Component>
  );
}
