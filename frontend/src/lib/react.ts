// Typed façade over the global React 16 class component.
export interface BaseComponent<P, S> {
  props: Readonly<P> & { children?: any };
  state: S;
  setState(update: Partial<S> | ((prev: S, props: P) => Partial<S> | null) | null, callback?: () => void): void;
  forceUpdate(callback?: () => void): void;
  render(): any;
}

export const Component = React.Component as {
  new <P = {}, S = {}>(props: P): BaseComponent<P, S>;
};

export const h = React.createElement;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
