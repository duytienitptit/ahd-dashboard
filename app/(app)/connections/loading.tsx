import { PageHeaderSkeleton, TableSkeleton } from "../skeleton";

// Mirrors connections/page.tsx. The DataTabs bar is deliberately not drawn here: it renders only
// for Manager, and loading.tsx runs before the role is known — showing it would flash a Manager-only
// control at a Creator.
export default function ConnectionsLoading() {
  return (
    <div className="px-8 py-10">
      <PageHeaderSkeleton />
      <TableSkeleton
        columns="1.9fr 1.2fr 1.3fr 1.5fr 1fr"
        minWidth="820px"
        headers={["Kênh", "Kết nối", "Đồng bộ gần nhất", "Hạn kết nối lại", "Thao tác"]}
      />
    </div>
  );
}
