import React, { FC, useLayoutEffect, useRef } from 'react';
import { useFetcher, useParams } from 'react-router-dom';
import styled from 'styled-components';

import { getRenderContext, render, RENDER_PURPOSE_SEND } from '../../../common/render';
import * as models from '../../../models';
import { WebSocketRequest } from '../../../models/websocket-request';
import { buildQueryStringFromParams, joinUrlAndQueryString } from '../../../utils/url/querystring';
import { ConnectActionParams } from '../../routes/request';
import { OneLineEditor, OneLineEditorHandle } from '../codemirror/one-line-editor';
import { createKeybindingsHandler, useDocBodyKeyboardShortcuts } from '../keydown-binder';
import { showAlert, showModal } from '../modals';
import { RequestRenderErrorModal } from '../modals/request-render-error-modal';
import { DisconnectButton } from './disconnect-button';

const Button = styled.button<{ warning?: boolean }>(({ warning }) => ({
  paddingRight: 'var(--padding-md)',
  paddingLeft: 'var(--padding-md)',
  textAlign: 'center',
  background: warning ? 'var(--color-danger)' : 'var(--color-surprise)',
  color: 'var(--color-font-surprise)',
  flex: '0 0 100px',
  ':hover': {
    filter: 'brightness(0.8)',
  },
}));

interface ActionBarProps {
  request: WebSocketRequest;
  environmentId: string;
  defaultValue: string;
  readyState: boolean;
  onChange: (value: string) => void;
}

const Form = styled.form({
  flex: 1,
  display: 'flex',
});

const StyledUrlBar = styled.div({
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  paddingRight: 'var(--padding-md)',
  paddingLeft: 'var(--padding-md)',
});

const WebSocketIcon = styled.span({
  color: 'var(--color-notice)',
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 'var(--padding-md)',
});

const ConnectionStatus = styled.span({
  color: 'var(--color-success)',
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 'var(--padding-md)',
});
export const ConnectionCircle = styled.span({
  backgroundColor: 'var(--color-success)',
  marginRight: 'var(--padding-sm)',
  width: 10,
  height: 10,
  borderRadius: '50%',
});

export const WebSocketActionBar: FC<ActionBarProps> = ({ request, environmentId, defaultValue, onChange, readyState }) => {
  const isOpen = readyState;
  const oneLineEditorRef = useRef<OneLineEditorHandle>(null);
  useLayoutEffect(() => {
    oneLineEditorRef.current?.focusEnd();
  }, []);

  const fetcher = useFetcher();
  const { organizationId, projectId, workspaceId, requestId } = useParams() as { organizationId: string; projectId: string; workspaceId: string; requestId: string };
  const connect = (connectParams: ConnectActionParams) => {
    fetcher.submit(JSON.stringify(connectParams),
      {
        action: `/organization/${organizationId}/project/${projectId}/workspace/${workspaceId}/debug/request/${requestId}/connect`,
        method: 'post',
        encType: 'application/json',
      });
  };
  const handleSubmit = async () => {
    if (isOpen) {
      window.main.webSocket.close({ requestId: request._id });
      return;
    }
    try {
      const renderContext = await getRenderContext({ request, environmentId, purpose: RENDER_PURPOSE_SEND });
      // Render any nunjucks tags in the url/headers/authentication settings/cookies
      const workspaceCookieJar = await models.cookieJar.getOrCreateForParentId(workspaceId);
      const rendered = await render({
        url: request.url,
        headers: request.headers,
        authentication: request.authentication,
        parameters: request.parameters.filter(p => !p.disabled),
        workspaceCookieJar,
      }, renderContext);
      connect({
        url: joinUrlAndQueryString(rendered.url, buildQueryStringFromParams(rendered.parameters)),
        headers: rendered.headers,
        authentication: rendered.authentication,
        cookieJar: rendered.workspaceCookieJar,
      });
    } catch (err) {
      if (err.type === 'render') {
        showModal(RequestRenderErrorModal, {
          request,
          error: err,
        });
      } else {
        showAlert({
          title: 'Unexpected Request Failure',
          message: (
            <div>
              <p>The request failed due to an unhandled error:</p>
              <code className="wide selectable">
                <pre>{err.message}</pre>
              </code>
            </div>
          ),
        });
      }
    }
  };

  useDocBodyKeyboardShortcuts({
    request_send: () => handleSubmit(),
    request_focusUrl: () => {
      oneLineEditorRef.current?.selectAll();
    },
  });

  const isConnectingOrClosed = !readyState;
  return (
    <>
      {!isOpen && <WebSocketIcon>WS</WebSocketIcon>}
      {isOpen && (
        <ConnectionStatus>
          <ConnectionCircle />
          CONNECTED
        </ConnectionStatus>
      )}
      <Form
        aria-disabled={isOpen}
        onSubmit={event => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <StyledUrlBar>
          <OneLineEditor
            ref={oneLineEditorRef}
            onKeyDown={createKeybindingsHandler({
              'Enter': () => handleSubmit(),
            })}
            readOnly={readyState}
            placeholder="wss://example.com/chat"
            defaultValue={defaultValue}
            onChange={onChange}
            type="text"
          />
        </StyledUrlBar>
        {isConnectingOrClosed
          ? <Button type="submit">Connect</Button>
          : <DisconnectButton requestId={request._id} />}
      </Form>
    </>
  );
};
