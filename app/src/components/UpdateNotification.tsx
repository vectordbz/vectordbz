import React, { useState, useEffect } from 'react';
import { Card, Button, Progress, Space, Typography } from 'antd';
import { 
  DownloadOutlined, 
  ReloadOutlined, 
  CloseOutlined,
  CheckCircleOutlined,
  SyncOutlined 
} from '@ant-design/icons';
import { useTheme, getThemeColors } from '../contexts/ThemeContext';

const { Text } = Typography;

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseName?: string;
}

interface UpdateNotificationProps {
  visible: boolean;
  updateAvailable: boolean;
  updateDownloaded: boolean;
  downloading: boolean;
  progress: number;
  version?: string;
  updateInfo?: UpdateInfo;
  onUpdateNow: () => void;
  onLater: () => void;
  onRestartNow: () => void;
  onRestartLater: () => void;
}

const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  visible,
  updateAvailable,
  updateDownloaded,
  downloading,
  progress,
  version,
  updateInfo,
  onUpdateNow,
  onLater,
  onRestartNow,
  onRestartLater,
}) => {
  const { mode } = useTheme();
  const colors = getThemeColors(mode);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when new update becomes available
  useEffect(() => {
    if (updateAvailable || updateDownloaded) {
      setDismissed(false);
    }
  }, [updateAvailable, updateDownloaded]);

  if (!visible || dismissed) {
    return null;
  }

  // Show update available notification
  if (updateAvailable && !downloading && !updateDownloaded) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 60,
          right: 20,
          width: 320,
          zIndex: 10000,
          animation: 'slideInRight 0.3s ease-out',
        }}
      >
        <Card
          size="small"
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            borderRadius: 8,
          }}
          bodyStyle={{ padding: 16 }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Space direction="vertical" size={4} style={{ flex: 1 }}>
                <Text strong style={{ color: colors.text, fontSize: 14 }}>
                  Update Available
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Version {version || updateInfo?.version} is now available
                </Text>
                {updateInfo?.releaseName && (
                  <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>
                    {updateInfo.releaseName}
                  </Text>
                )}
              </Space>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setDismissed(true)}
                style={{
                  color: colors.textSecondary,
                  padding: 0,
                  width: 20,
                  height: 20,
                  minWidth: 20,
                }}
              />
            </div>
            <Space style={{ width: '100%', marginTop: 8 }} size="small">
              <Button
                type="primary"
                size="small"
                icon={<DownloadOutlined />}
                onClick={onUpdateNow}
                style={{ flex: 1 }}
              >
                Update Now
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setDismissed(true);
                  onLater();
                }}
                style={{ flex: 1 }}
              >
                Later
              </Button>
            </Space>
          </Space>
        </Card>
        <style>{`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  // Show download progress
  if (downloading && !updateDownloaded) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 60,
          right: 20,
          width: 320,
          zIndex: 10000,
        }}
      >
        <Card
          size="small"
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.primary}`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            borderRadius: 8,
          }}
          bodyStyle={{ padding: 16 }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SyncOutlined spin style={{ color: colors.primary, fontSize: 16 }} />
              <Text strong style={{ color: colors.text, fontSize: 14, flex: 1 }}>
                Downloading Update
              </Text>
            </div>
            <Progress
              percent={Math.round(progress)}
              size="small"
              strokeColor={colors.primary}
              showInfo
              format={(percent) => `${percent}%`}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Version {version || updateInfo?.version}
            </Text>
          </Space>
        </Card>
      </div>
    );
  }

  // Show update downloaded notification
  if (updateDownloaded) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 60,
          right: 20,
          width: 320,
          zIndex: 10000,
          animation: 'slideInRight 0.3s ease-out',
        }}
      >
        <Card
          size="small"
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.success}`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            borderRadius: 8,
          }}
          bodyStyle={{ padding: 16 }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Space direction="vertical" size={4} style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircleOutlined style={{ color: colors.success, fontSize: 16 }} />
                  <Text strong style={{ color: colors.text, fontSize: 14 }}>
                    Update Ready
                  </Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Version {version || updateInfo?.version} has been downloaded
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Restart the app to apply the update
                </Text>
              </Space>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => {
                  setDismissed(true);
                  onRestartLater();
                }}
                style={{
                  color: colors.textSecondary,
                  padding: 0,
                  width: 20,
                  height: 20,
                  minWidth: 20,
                }}
              />
            </div>
            <Space style={{ width: '100%', marginTop: 8 }} size="small">
              <Button
                type="primary"
                size="small"
                icon={<ReloadOutlined />}
                onClick={onRestartNow}
                style={{ flex: 1, background: colors.success, borderColor: colors.success }}
              >
                Restart App
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setDismissed(true);
                  onRestartLater();
                }}
                style={{ flex: 1 }}
              >
                Later
              </Button>
            </Space>
          </Space>
        </Card>
        <style>{`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;

