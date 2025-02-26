import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Platform, NativeModules } from "react-native";
import Config from "react-native-config";
import { useSelector, useDispatch } from "react-redux";
import { Trans } from "react-i18next";
import {
  useNavigation,
  useTheme as useNavTheme,
} from "@react-navigation/native";
import { discoverDevices, TransportModule } from "@ledgerhq/live-common/lib/hw";
import { Device } from "@ledgerhq/live-common/lib/hw/actions/types";
import { Button } from "@ledgerhq/native-ui";
import { useTheme } from "styled-components/native";
import { ScreenName } from "../../const";
import { knownDevicesSelector } from "../../reducers/ble";
import { setHasConnectedDevice } from "../../actions/appstate";
import DeviceItem from "./DeviceItem";
import BluetoothEmpty from "./BluetoothEmpty";
import USBEmpty from "./USBEmpty";
import LText from "../LText";
import Animation from "../Animation";
import { track } from "../../analytics";
import { setLastConnectedDevice } from "../../actions/settings";

import PairLight from "../../screens/Onboarding/assets/nanoX/pairDevice/light.json";
import PairDark from "../../screens/Onboarding/assets/nanoX/pairDevice/dark.json";

type Props = {
  onBluetoothDeviceAction?: (device: Device) => void;
  onSelect: (device: Device) => void;
  onWithoutDevice?: () => void;
  withArrows?: boolean;
  usbOnly?: boolean;
  filter?: (transportModule: TransportModule) => boolean;
  autoSelectOnAdd?: boolean;
  hideAnimation?: boolean;
};

export default function SelectDevice({
  usbOnly,
  withArrows,
  filter = () => true,
  onSelect,
  onWithoutDevice,
  onBluetoothDeviceAction,
  autoSelectOnAdd,
  hideAnimation,
}: Props) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const knownDevices = useSelector(knownDevicesSelector);
  const dispatch = useDispatch();

  const handleOnSelect = useCallback(
    deviceInfo => {
      const { modelId, wired } = deviceInfo;
      if (wired) {
        track("Device selection", {
          modelId,
          connectionType: "USB",
        });
        // Nb consider a device selection enough to show the fw update banner in portfolio
        dispatch(setHasConnectedDevice(true));
        dispatch(setLastConnectedDevice(deviceInfo));
        onSelect(deviceInfo);
      } else {
        NativeModules.BluetoothHelperModule.prompt()
          .then(() => {
            track("Device selection", {
              modelId,
              connectionType: "BLE",
            });
            // Nb consider a device selection enough to show the fw update banner in portfolio
            dispatch(setHasConnectedDevice(true));
            onSelect(deviceInfo);
          })
          .catch(() => {
            /* ignore */
          });
      }
    },
    [dispatch, onSelect],
  );

  const [devices, setDevices] = useState([]);

  const onPairNewDevice = useCallback(() => {
    NativeModules.BluetoothHelperModule.prompt()
      .then(() =>
        // @ts-expect-error navigation issue
        navigation.navigate(ScreenName.PairDevices, {
          onDone: autoSelectOnAdd ? handleOnSelect : null,
        }),
      )
      .catch(() => {
        /* ignore */
      });
  }, [autoSelectOnAdd, navigation, handleOnSelect]);

  const renderItem = useCallback(
    (item: Device) => (
      <DeviceItem
        key={item.deviceId}
        deviceMeta={item}
        onSelect={handleOnSelect}
        withArrow={!!withArrows}
        onBluetoothDeviceAction={onBluetoothDeviceAction}
      />
    ),
    [withArrows, onBluetoothDeviceAction, handleOnSelect],
  );

  const all: Device[] = getAll({ knownDevices }, { devices });

  const [ble, other] = all.reduce(
    ([ble, other], device) =>
      device.wired ? [ble, [...other, device]] : [[...ble, device], other],
    [[], []],
  );

  const hasUSBSection = Platform.OS === "android" || other.length > 0;

  useEffect(() => {
    const subscription = discoverDevices(filter).subscribe(e => {
      setDevices(devices => {
        if (e.type !== "add") {
          return devices.filter(d => d.deviceId !== e.id);
        }

        if (!devices.find(d => d.deviceId === e.id)) {
          return [
            ...devices,
            {
              deviceId: e.id,
              deviceName: e.name || "",
              modelId:
                (e.deviceModel && e.deviceModel.id) ||
                Config?.FALLBACK_DEVICE_MODEL_ID ||
                "nanoX",
              wired: e.id.startsWith("httpdebug|")
                ? Config?.FALLBACK_DEVICE_WIRED === "YES"
                : e.id.startsWith("usb|"),
            },
          ];
        }

        return devices;
      });
    });
    return () => subscription.unsubscribe();
  }, [knownDevices, filter]);

  return (
    <>
      {usbOnly && withArrows && !hideAnimation ? (
        <UsbPlaceholder />
      ) : usbOnly ? null : ble.length === 0 ? (
        <BluetoothEmpty
          hideAnimation={hideAnimation}
          onPairNewDevice={onPairNewDevice}
        />
      ) : (
        <View>
          <BluetoothHeader />
          {ble.map(renderItem)}
          <Button
            onPress={onPairNewDevice}
            event="AddDevice"
            type={"main"}
            mt={6}
            mb={6}
          >
            <Trans i18nKey="SelectDevice.deviceNotFoundPairNewDevice" />
          </Button>
        </View>
      )}
      {hasUSBSection &&
        !usbOnly &&
        (ble.length === 0 ? (
          <View
            style={[styles.separator, { backgroundColor: colors.neutral.c40 }]}
          />
        ) : (
          <USBHeader />
        ))}
      {other.length === 0 ? (
        <USBEmpty usbOnly={usbOnly} />
      ) : (
        other.map(renderItem)
      )}
      {onWithoutDevice && (
        <View>
          <WithoutDeviceHeader />
          <Button
            onPress={onWithoutDevice}
            event="WithoutDevice"
            type={"main"}
            mt={6}
            mb={6}
          >
            <Trans i18nKey="SelectDevice.withoutDevice" />
          </Button>
        </View>
      )}
    </>
  );
}

const BluetoothHeader = () => (
  <View style={styles.header}>
    <LText style={styles.headerText} color="grey">
      <Trans i18nKey="common.bluetooth" />
    </LText>
  </View>
);

const USBHeader = () => (
  <LText style={styles.headerText} color="grey">
    <Trans i18nKey="common.usb" />
  </LText>
);

const WithoutDeviceHeader = () => (
  <View style={styles.header}>
    <LText style={styles.headerText} color="grey">
      <Trans i18nKey="SelectDevice.withoutDeviceHeader" />
    </LText>
  </View>
);

// Fixme Use the illustration instead of the png
const UsbPlaceholder = () => {
  const { dark } = useNavTheme();
  return (
    <View style={styles.imageContainer}>
      <Animation style={styles.image} source={dark ? PairDark : PairLight} />
    </View>
  );
};

function getAll({ knownDevices }, { devices }): Device[] {
  return [
    ...devices,
    ...knownDevices.map(d => ({
      deviceId: d.id,
      deviceName: d.name || "",
      wired: false,
      modelId: "nanoX",
    })),
  ];
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerText: {
    fontSize: 14,
    lineHeight: 21,
  },
  separator: {
    width: "100%",
    height: 1,
    marginVertical: 24,
  },
  imageContainer: {
    minHeight: 200,
    position: "relative",
    overflow: "visible",
  },
  image: {
    position: "absolute",
    right: "-5%",
    top: 0,
    width: "110%",
    height: "100%",
  },
});
