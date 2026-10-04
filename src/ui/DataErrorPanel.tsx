import type { Issue } from '../data/validate';

type Props = { title: string; message: string; issues: readonly Issue[] };

/** Readable list of data validation problems (spec.md §12.4: never a blank screen). */
export function DataErrorPanel({ title, message, issues }: Props) {
  return (
    <div role="alert" className="data-error">
      <h2>{title}</h2>
      {issues.length ? (
        <ul>
          {issues.map((issue, i) => (
            <li key={i}>
              <code>{issue.path}</code> {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
}
