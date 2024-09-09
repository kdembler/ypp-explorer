import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import * as dn from "dnum";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import request from "graphql-request";
import { GetChannelPaymentsDocument } from "./gql/graphql";
import { getPaymentsQueryDocument } from "./queries/payments";

const formatJoy = (raw: string) => {
  return `${dn.format([BigInt(raw), 10], { digits: 2 })} JOY`;
};

const fetchPayments = async () => {
  const allPayments = [];
  let offset = 0;
  const limit = 5000; // Adjust this based on API limitations
  while (true) {
    const response = await request(
      "https://query.joyutils.org/graphql",
      getPaymentsQueryDocument,
      {
        limit,
        offset,
      }
    );

    const newPayments = response.channelPaymentMadeEvents;
    allPayments.push(...newPayments);

    if (newPayments.length < limit) {
      break; // We've fetched all available data
    }

    offset += limit;
  }

  return allPayments;
};

const ROW_HEIGHT = 37; // Adjust this value based on your design

const CreatorPaymentsExplorer = () => {
  const [groupByChannel, setGroupByChannel] = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    data: payments,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["payments"],
    queryFn: fetchPayments,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const groupedPayments = useMemo(() => {
    if (!payments) return [];
    return Object.values(
      payments.reduce<
        Record<
          string,
          {
            channelId: string;
            channelTitle: string;
            totalAmount: bigint;
            count: number;
          }
        >
      >((acc, payment) => {
        const channelId = payment.payeeChannel!.id;
        if (!acc[channelId]) {
          acc[channelId] = {
            channelId,
            channelTitle: payment.payeeChannel?.title || "Unknown",
            totalAmount: 0n,
            count: 0,
          };
        }
        acc[channelId].totalAmount += BigInt(payment.amount);
        acc[channelId].count += 1;
        return acc;
      }, {})
    );
  }, [payments]);

  const columns = useMemo<ColumnDef<any>[]>(
    () =>
      groupByChannel
        ? [
            {
              header: "Channel ID",
              accessorKey: "channelId",
            },
            {
              header: "Channel Title",
              accessorKey: "channelTitle",
              cell: (cell) => {
                const id = cell.row.original.channelId;
                const title = cell.getValue() as string;
                return (
                  <a
                    href={`https://gleev.xyz/channel/${id}`}
                    target="_blank"
                    className="underline"
                  >
                    {title}
                  </a>
                );
              },
            },
            {
              header: "Total Amount",
              accessorKey: "totalAmount",
              cell: (cell) => {
                return formatJoy(cell.getValue());
              },
            },
            { header: "Payment Count", accessorKey: "count" },
          ]
        : [
            { header: "ID", accessorKey: "id" },
            { header: "Channel ID", accessorKey: "payeeChannel.id" },
            {
              header: "Channel Title",
              accessorKey: "payeeChannel.title",
              cell: (cell) => {
                const id = cell.row.original.payeeChannel.id;
                const title = cell.getValue() as string;
                return (
                  <a
                    href={`https://gleev.xyz/channel/${id}`}
                    target="_blank"
                    className="underline"
                  >
                    {title}
                  </a>
                );
              },
            },
            {
              header: "Amount",
              accessorKey: "amount",
              cell: (cell) => {
                return formatJoy(cell.getValue());
              },
            },
            { header: "Block", accessorKey: "inBlock" },
            { header: "Rationale", accessorKey: "rationale" },
          ],
    [groupByChannel]
  );

  const data = useMemo(
    () => (groupByChannel ? groupedPayments : payments || []),
    [groupByChannel, groupedPayments, payments]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    initialState: {
      sorting: [
        {
          id: "totalAmount",
          desc: true,
        },
      ],
    },
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  if (isLoading) return <div>Loading...</div>;
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">YPP Payments Explorer</h1>
      <div className="mb-4 flex items-center">
        <Input
          type="text"
          placeholder="Search..."
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="mr-2"
        />
        <Button onClick={() => setGroupByChannel(!groupByChannel)}>
          {groupByChannel ? "Show All Payments" : "Group by Channel"}
        </Button>
        <Button
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          className="ml-2"
        >
          Reload data
        </Button>
      </div>
      <div ref={parentRef} className="h-[600px] max-h-[600px] overflow-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize() + 40}px`,
            width: "100%",
          }}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: " 🔼",
                        desc: " 🔽",
                      }[header.column.getIsSorted() as string] ?? null}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {virtualItems.map((virtualRow, index) => {
                const row = rows[virtualRow.index];
                return (
                  <TableRow
                    key={row.id}
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${
                        virtualRow.start - index * virtualRow.size
                      }px)`,
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default CreatorPaymentsExplorer;
