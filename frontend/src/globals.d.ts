// React 16.0 UMD builds are vendored in public/vendor and exposed as globals.
// No @types package is available offline, so the surface used by the app is declared here.
declare const React: {
  createElement(type: any, props?: any, ...children: any[]): any;
  Component: any;
};
declare const ReactDOM: {
  render(element: any, container: Element | null): void;
  createPortal(children: any, container: Element): any;
};

declare namespace JSX {
  interface Element {}
  interface ElementClass {
    render(): any;
  }
  interface ElementAttributesProperty {
    props: {};
  }
  interface ElementChildrenAttribute {
    children: {};
  }
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface IntrinsicElements {
    [name: string]: any;
  }
}
