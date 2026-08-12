import { STAGE_META } from '@taxflow/core';
export default function Page() {
  return <div>{Object.keys(STAGE_META).length} stages</div>;
}
