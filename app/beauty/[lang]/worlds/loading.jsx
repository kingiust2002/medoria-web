// app/beauty/[lang]/worlds/loading.jsx — Next.js streams this in instantly while
// the World page's category-tree query resolves, so the browser never sits on a
// blank tab during the DB round trip. Shape matches the real 7-tile, 2-wide
// department grid so there's no layout jump when the real content arrives.
export default function WorldsLoading() {
  return (
    <div className="pb-20">
      <div className="container-x pt-8 pb-6">
        <div className="skeleton h-4 w-40 mb-5" />
        <div className="skeleton h-11 w-56 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="container-x">
        <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[16/10] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
