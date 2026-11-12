/** Placeholder in the shape of the home screen while the first data loads. */
export function Skeleton() {
  return (
    <div className="page page--home" aria-busy="true" aria-label="Loading">
      <div className="greet">
        <span className="sk sk--line" style={{ width: 110 }} />
        <span className="sk sk--title" style={{ width: 200 }} />
      </div>
      <div className="sk sk--hero" />
      <div className="dash">
        <div className="tiles dash__tiles">
          <div className="sk sk--tile" />
          <div className="sk sk--tile" />
        </div>
        <div className="sk sk--map dash__map" />
      </div>
    </div>
  );
}
