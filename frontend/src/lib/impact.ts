// Impact model: nursing time recovered by diverting non-clinical call bells.
// All inputs are editable estimates; see docs/impact_model.md for sources and caveats.

export interface ImpactInputs {
  beds: number
  callsPerBedPerDay: number
  pctNonClinical: number // 0–100
  minutesPerInterruption: number
  nurseHourlyCost: number // fully loaded $/h
  patientsPerNurse: number
}

export const DEFAULT_INPUTS: ImpactInputs = {
  beds: 30,
  callsPerBedPerDay: 10,
  pctNonClinical: 60,
  minutesPerInterruption: 4,
  nurseHourlyCost: 60,
  patientsPerNurse: 5,
}

export const HOSPITAL_BEDS = 500
export const FTE_HOURS_PER_YEAR = 2080

export interface ImpactResult {
  divertedPerDay: number
  hoursPerYear: number
  dollarsPerYear: number
  fte: number
  interruptionsAvoidedPerNurseShift: number
}

export function computeImpact(i: ImpactInputs, beds: number = i.beds): ImpactResult {
  const divertedPerDay = beds * i.callsPerBedPerDay * (i.pctNonClinical / 100)
  const hoursPerYear = (divertedPerDay * 365 * i.minutesPerInterruption) / 60
  const nursesPerShift = Math.max(1, beds / Math.max(1, i.patientsPerNurse))
  return {
    divertedPerDay,
    hoursPerYear,
    dollarsPerYear: hoursPerYear * i.nurseHourlyCost,
    fte: hoursPerYear / FTE_HOURS_PER_YEAR,
    // two 12-hour shifts per day
    interruptionsAvoidedPerNurseShift: divertedPerDay / 2 / nursesPerShift,
  }
}
