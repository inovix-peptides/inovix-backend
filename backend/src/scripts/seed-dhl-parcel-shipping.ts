import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import {
  createRegionsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows";

const DHL_PROVIDER_ID = "dhl-parcel_dhl-parcel";

export default async function seedDhlParcelShipping({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const regionModuleService = container.resolve(Modules.REGION);

  // ------------------------------------------------------------------
  // 1. Verify the dhl-parcel provider is registered
  // ------------------------------------------------------------------
  const allProviders =
    await fulfillmentModuleService.listFulfillmentProviders();
  const dhlProvider = allProviders.find((p) => p.id === DHL_PROVIDER_ID);
  if (!dhlProvider) {
    logger.error(
      `Provider "${DHL_PROVIDER_ID}" not found in fulfillment_provider table. ` +
        `Registered providers: ${allProviders.map((p) => p.id).join(", ")}. ` +
        `The medusa boot did not pick up the dhl-parcel module — check medusa-config.js.`
    );
    return;
  }
  logger.info(`Provider verified: ${DHL_PROVIDER_ID}`);

  // ------------------------------------------------------------------
  // 2. Idempotency check: skip if DHL options already exist
  // ------------------------------------------------------------------
  const allShippingOptions = await fulfillmentModuleService.listShippingOptions(
    {} as any
  );
  const existingOptions = allShippingOptions.filter(
    (o) => o.provider_id === DHL_PROVIDER_ID
  );
  const hasThuisbezorgd = existingOptions.some(
    (o) => o.name === "DHL Thuisbezorgd"
  );
  const hasServicepunt = existingOptions.some(
    (o) => o.name === "DHL Servicepunt"
  );

  if (hasThuisbezorgd && hasServicepunt) {
    logger.info(
      "DHL Thuisbezorgd and DHL Servicepunt already exist — nothing to do."
    );
    return;
  }

  // ------------------------------------------------------------------
  // 3. Find or create the NL region (EUR currency, nl country)
  // ------------------------------------------------------------------
  logger.info("Resolving NL region...");
  const existingRegions = await regionModuleService.listRegions({
    currency_code: "eur",
  });

  let region = existingRegions[0] ?? null;

  if (!region) {
    logger.info("No EUR region found — creating NL region...");
    const { result: regionResult } = await createRegionsWorkflow(
      container
    ).run({
      input: {
        regions: [
          {
            name: "Nederland",
            currency_code: "eur",
            countries: ["nl", "de", "be"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    });
    region = regionResult[0];
    logger.info(`Created region: ${region.id} (${region.name})`);
  } else {
    logger.info(`Using existing region: ${region.id} (${region.name})`);
  }

  // ------------------------------------------------------------------
  // 4. Find or create the default shipping profile
  // ------------------------------------------------------------------
  logger.info("Resolving shipping profile...");
  const shippingProfiles =
    await fulfillmentModuleService.listShippingProfiles({ type: "default" });
  let shippingProfile = shippingProfiles[0] ?? null;

  if (!shippingProfile) {
    logger.info("No default shipping profile — creating one...");
    const { result: profileResult } = await createShippingProfilesWorkflow(
      container
    ).run({
      input: {
        data: [{ name: "Default Shipping Profile", type: "default" }],
      },
    });
    shippingProfile = profileResult[0];
    logger.info(`Created shipping profile: ${shippingProfile.id}`);
  } else {
    logger.info(`Using existing shipping profile: ${shippingProfile.id}`);
  }

  // ------------------------------------------------------------------
  // 5. Find or create the NL fulfillment set + service zone
  // ------------------------------------------------------------------
  logger.info("Resolving fulfillment set and service zone...");
  const existingFulfillmentSets =
    await fulfillmentModuleService.listFulfillmentSets(
      { name: "NL Warehouse delivery" },
      { relations: ["service_zones"] }
    );

  let serviceZoneId: string;

  if (existingFulfillmentSets.length > 0) {
    const fs = existingFulfillmentSets[0];
    serviceZoneId = fs.service_zones[0].id;
    logger.info(
      `Using existing fulfillment set: ${fs.id}, service zone: ${serviceZoneId}`
    );
  } else {
    // Also check if there's any fulfillment set with an NL service zone
    const allFulfillmentSets =
      await fulfillmentModuleService.listFulfillmentSets(
        {},
        { relations: ["service_zones", "service_zones.geo_zones"] }
      );

    const nlFulfillmentSet = allFulfillmentSets.find((fs) =>
      fs.service_zones.some((sz) =>
        sz.geo_zones?.some((gz) => gz.country_code === "nl")
      )
    );

    if (nlFulfillmentSet) {
      const nlServiceZone = nlFulfillmentSet.service_zones.find((sz) =>
        sz.geo_zones?.some((gz) => gz.country_code === "nl")
      );
      serviceZoneId = nlServiceZone!.id;
      logger.info(
        `Using existing NL service zone: ${serviceZoneId} in fulfillment set: ${nlFulfillmentSet.id}`
      );
    } else {
      logger.info("No NL fulfillment set found — creating one...");

      // Need a stock location to link to
      const stockLocationModuleService = container.resolve(
        Modules.STOCK_LOCATION
      );
      const existingLocations =
        await stockLocationModuleService.listStockLocations({});
      let stockLocation = existingLocations[0] ?? null;

      if (!stockLocation) {
        const { result: locationResult } =
          await createStockLocationsWorkflow(container).run({
            input: {
              locations: [
                {
                  name: "NL Warehouse",
                  address: {
                    city: "Amsterdam",
                    country_code: "NL",
                    address_1: "",
                  },
                },
              ],
            },
          });
        stockLocation = locationResult[0];
        logger.info(`Created stock location: ${stockLocation.id}`);
      } else {
        logger.info(`Using existing stock location: ${stockLocation.id}`);
      }

      const fulfillmentSet =
        await fulfillmentModuleService.createFulfillmentSets({
          name: "NL Warehouse delivery",
          type: "shipping",
          service_zones: [
            {
              name: "Netherlands",
              geo_zones: [
                { country_code: "nl", type: "country" },
                { country_code: "de", type: "country" },
                { country_code: "be", type: "country" },
              ],
            },
          ],
        });

      serviceZoneId = fulfillmentSet.service_zones[0].id;
      logger.info(
        `Created fulfillment set: ${fulfillmentSet.id}, service zone: ${serviceZoneId}`
      );

      // Link stock location to fulfillment set
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_set_id: fulfillmentSet.id,
        },
      });

      // Link stock location to dhl-parcel provider
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_provider_id: DHL_PROVIDER_ID,
        },
      });
    }
  }

  // ------------------------------------------------------------------
  // 6. Create the 2 DHL shipping options (prices in major units, matching seed.ts)
  // ------------------------------------------------------------------
  logger.info("Creating DHL shipping options...");

  // metadata is on ShippingOption entity but missing from CreateShippingOptionDTO typing in some versions; runtime persists it.
  await createShippingOptionsWorkflow(container).run({
    input: ([
      ...(hasThuisbezorgd
        ? []
        : [
            {
              name: "DHL Thuisbezorgd",
              price_type: "flat",
              provider_id: DHL_PROVIDER_ID,
              service_zone_id: serviceZoneId,
              shipping_profile_id: shippingProfile.id,
              type: {
                label: "Thuisbezorgd",
                description: "Bezorgd bij u thuis door DHL.",
                code: "dhl-thuisbezorgd",
              },
              data: { dhl_option: "DOOR" },
              prices: [
                { currency_code: "eur", amount: 5.95 },
                { region_id: region.id, amount: 5.95 },
              ],
              rules: [
                { attribute: "enabled_in_store", value: "true", operator: "eq" },
                { attribute: "is_return", value: "false", operator: "eq" },
              ],
            },
          ]),
      ...(hasServicepunt
        ? []
        : [
            {
              name: "DHL Servicepunt",
              price_type: "flat",
              provider_id: DHL_PROVIDER_ID,
              service_zone_id: serviceZoneId,
              shipping_profile_id: shippingProfile.id,
              type: {
                label: "Servicepunt",
                description: "Ophalen bij een DHL Servicepunt.",
                code: "dhl-servicepunt",
              },
              data: { dhl_option: "PS" },
              prices: [
                { currency_code: "eur", amount: 4.95 },
                { region_id: region.id, amount: 4.95 },
              ],
              rules: [
                { attribute: "enabled_in_store", value: "true", operator: "eq" },
                { attribute: "is_return", value: "false", operator: "eq" },
              ],
            },
          ]),
    ] as any),
  });

  // ------------------------------------------------------------------
  // 7. Log created option IDs
  // ------------------------------------------------------------------
  const allCreatedOptions = await fulfillmentModuleService.listShippingOptions(
    {} as any
  );
  const createdOptions = allCreatedOptions.filter(
    (o) => o.provider_id === DHL_PROVIDER_ID
  );

  for (const opt of createdOptions) {
    logger.info(`Shipping option ready: ${opt.id} | ${opt.name} | provider: ${opt.provider_id}`);
  }

  logger.info("Done seeding DHL Parcel NL shipping options.");
}
