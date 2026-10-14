export const Component = React.Component;
export const h = React.createElement;
export function cx(...parts) {
    return parts.filter(Boolean).join(' ');
}
