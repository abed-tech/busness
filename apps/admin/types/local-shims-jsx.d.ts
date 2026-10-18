// JSX global (vérification hors ligne uniquement).
  namespace JSX {
    type Element = any;
    type ElementType = string | ((props: any) => any);
    interface IntrinsicElements { [tag: string]: any }
    interface IntrinsicAttributes { key?: string | number | null }
    interface ElementChildrenAttribute { children: {} }
  }

