import * as React from 'react';
import { renderWidget } from '@remnote/plugin-sdk';

import { Panel } from '../ui/Panel.tsx';
import { Styles } from '../ui/Styles.tsx';

function CommentsSidebar(): JSX.Element {
  return (
    <>
      <Styles />
      <Panel />
    </>
  );
}

renderWidget(CommentsSidebar);
