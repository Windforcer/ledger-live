import React, { useState, useCallback, useEffect, memo, useMemo } from "react";
import { useDispatch } from "react-redux";
import type { DeviceInfo } from "@ledgerhq/live-common/lib/types/manager";
import type { Device } from "@ledgerhq/live-common/lib/hw/actions/types";
import type { ListAppsResult } from "@ledgerhq/live-common/lib/apps/types";
import { predictOptimisticState } from "@ledgerhq/live-common/lib/apps";
import { SyncSkipUnderPriority } from "@ledgerhq/live-common/lib/bridge/react";
import { useApps } from "./shared";
import AppsScreen from "./AppsScreen";
import GenericErrorBottomModal from "../../components/GenericErrorBottomModal";
import { TrackScreen } from "../../analytics";
import QuitManagerModal from "./Modals/QuitManagerModal";
import StorageWarningModal from "./Modals/StorageWarningModal";
import AppDependenciesModal from "./Modals/AppDependenciesModal";
import UninstallDependenciesModal from "./Modals/UninstallDependenciesModal";
import { useLockNavigation } from "../../components/RootNavigator/CustomBlockRouterNavigator";
import { setLastSeenDeviceInfo } from "../../actions/settings";
import { ScreenName } from "../../const";
import FirmwareUpdateScreen from "../../components/FirmwareUpdate";
import { CommonActions } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import useLatestFirmware from "../../hooks/useLatestFirmware";
import { isFirmwareUpdateVersionSupported } from "../../logic/firmwareUpdate";

export const MANAGER_TABS = {
  CATALOG: "CATALOG",
  INSTALLED_APPS: "INSTALLED_APPS",
};

export type ManagerTab = keyof typeof MANAGER_TABS;

type Props = {
  navigation: StackNavigationProp<any>,
  route: {
    params: {
      device: Device,
      deviceInfo: DeviceInfo,
      result: ListAppsResult,
      searchQuery?: string,
      firmwareUpdate?: boolean,
      appsToRestore?: string[],
      updateModalOpened?: boolean,
      tab: ManagerTab,
    },
  },
};

const Manager = ({
  navigation,
  route,
}: Props) => {
  const {
      device,
      deviceInfo,
      result,
      searchQuery,
      firmwareUpdate,
      appsToRestore,
      updateModalOpened,
      tab = "CATALOG",
    } = route.params;

  const { deviceId, deviceName, modelId } = device;
  const [state, dispatch] = useApps(result, deviceId, appsToRestore);
  const reduxDispatch = useDispatch();

  const { apps, currentError, installQueue, uninstallQueue } = state;
  const blockNavigation = installQueue.length + uninstallQueue.length > 0;

  const optimisticState = useMemo(() => predictOptimisticState(state), [state]);
  const latestFirmware = useLatestFirmware(deviceInfo);

  const [quitManagerAction, setQuitManagerAction] = useState<any>(null);

  const [isFirmwareUpdateOpen, setIsFirmwareUpdateOpen] = useState(false);
  useEffect(() => {
    if(latestFirmware && firmwareUpdate && isFirmwareUpdateVersionSupported(deviceInfo, device.modelId)) {
      setIsFirmwareUpdateOpen(true);
    }
  }, [firmwareUpdate, latestFirmware]);
  /** general error state */
  const [error, setError] = useState<Error | null>(null);
  /** storage warning modal state */
  const [storageWarning, setStorageWarning] = useState(null);
  /** install app with dependencies modal state */
  const [appInstallWithDependencies, setAppInstallWithDependencies] = useState(
    null,
  );
  /** uninstall app with dependencies modal state */
  const [
    appUninstallWithDependencies,
    setAppUninstallWithDependencies,
  ] = useState(null);

  /** open error modal each time a new error appears in state.currentError */
  useEffect(() => {
    if (currentError) {
      setError(currentError.error);
    }
  }, [setError, currentError]);

  // send informations to main router in order to lock navigation
  useLockNavigation(blockNavigation, setQuitManagerAction, navigation);

  // Save last seen device
  useEffect(() => {
    const dmi = {
      modelId: device.modelId,
      deviceInfo,
      apps: state.installed.map(({ name, version }) => ({
        name,
        version,
      })),
    };
    reduxDispatch(setLastSeenDeviceInfo(dmi));
  }, [device, state.installed, deviceInfo, reduxDispatch]);

  const installedApps = useMemo(() => state.installed.map(({ name }) => name), [state.installed]);

  /**
   * Resets the navigation params in order to unlock navigation
   * then trigger caught navigation action
   */
  const quitManager = useCallback(() => {
    navigation.dispatch(quitManagerAction);
    setQuitManagerAction(null);
  }, [quitManagerAction, setQuitManagerAction, navigation]);

  const closeErrorModal = useCallback(() => setError(null), [setError]);

  const resetAppInstallWithDependencies = useCallback(() => {
    setAppInstallWithDependencies(null);
  }, [setAppInstallWithDependencies]);

  const resetAppUninstallWithDependencies = useCallback(() => {
    setAppUninstallWithDependencies(null);
  }, [setAppUninstallWithDependencies]);

  const closeQuitManagerModal = useCallback(() => setQuitManagerAction(null), [
    setQuitManagerAction,
  ]);

  const resetStorageWarning = useCallback(() => setStorageWarning(null), [
    setStorageWarning,
  ]);

  const onCloseFirmwareUpdate = useCallback((restoreApps?: boolean) => {
      setIsFirmwareUpdateOpen(false);

      // removes the firmwareUpdate param from the stack navigation so we don't open the modal again
      // if the user comes back to this page within the stack
      navigation.dispatch(state => {
        const routes = state.routes.map(route => ({ ...route, params: { ...route.params, firmwareUpdate: false }}));
        return CommonActions.reset({ ...state, routes });
      });
      if(restoreApps) {
        // we renavigate to the manager to force redetection of the apps and restore apps if needed        
        navigation.replace(ScreenName.Manager, {
          device,
          appsToRestore: installedApps,
          firmwareUpdate: false
        });
      }
  }, [installedApps, navigation]);

  return (
    <>
      <TrackScreen
        category="Manager"
        name="AppsList"
        deviceModelId={modelId}
        deviceVersion={deviceInfo.version}
        appLength={result ? result.installed.length : 0}
      />
      <SyncSkipUnderPriority priority={100} />
      <AppsScreen
        state={state}
        dispatch={dispatch}
        navigation={navigation}
        setAppInstallWithDependencies={setAppInstallWithDependencies}
        setAppUninstallWithDependencies={setAppUninstallWithDependencies}
        setStorageWarning={setStorageWarning}
        managerTabs={MANAGER_TABS}
        deviceId={deviceId}
        initialDeviceName={deviceName}
        blockNavigation={blockNavigation}
        deviceInfo={deviceInfo}
        searchQuery={searchQuery}
        updateModalOpened={updateModalOpened}
        optimisticState={optimisticState}
        tab={tab}
        result={result}
      />
      <GenericErrorBottomModal error={error} onClose={closeErrorModal} />
      <QuitManagerModal
        isOpened={quitManagerAction}
        onConfirm={quitManager}
        onClose={closeQuitManagerModal}
        installQueue={installQueue}
        uninstallQueue={uninstallQueue}
      />
      <StorageWarningModal
        warning={storageWarning}
        onClose={resetStorageWarning}
      />
      <AppDependenciesModal
        appInstallWithDependencies={appInstallWithDependencies}
        onClose={resetAppInstallWithDependencies}
        appList={apps}
        dispatch={dispatch}
      />
      <UninstallDependenciesModal
        appUninstallWithDependencies={appUninstallWithDependencies}
        onClose={resetAppUninstallWithDependencies}
        dispatch={dispatch}
      />
      <FirmwareUpdateScreen
        device={device}
        deviceInfo={deviceInfo}
        isOpen={isFirmwareUpdateOpen}
        onClose={onCloseFirmwareUpdate}
        hasAppsToRestore={Boolean(appsToRestore?.length)}
      />
    </>
  );
};

export default memo(Manager);
